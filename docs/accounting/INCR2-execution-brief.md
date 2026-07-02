# INCR-2 — AuditEvent append-only (hash-chain) — Execution Brief

> **Autoridade final:** ADR-INCR2 (`docs/adr/ADR-INCR2-audit-trail.md`) · Plano v2 (`docs/accounting/PLANEJAMENTO-buildout-contabil-v2.md §3 INCR-2`)
> **Baseline:** commit `ea562e0` (INCR-1 fechado)
> **Pré-condição:** `PostingService` com 5 args, `PeriodService` em operação, `525/525` tests verdes.

---

## 1. Modelo Prisma (ratificado)

```prisma
model AuditEvent {
  id               String   @id @default(cuid())
  scopeUserId      String
  unitId           String
  seq              BigInt
  actorUserId      String?
  actorType        String   @default("USER")  // USER | SYSTEM | SERVICE_ACCOUNT
  eventType        String
  targetType       String
  targetId         String
  payload          String                      // canonical JSON string, allowlist por eventType
  prevHash         String
  hash             String
  hashVersion      Int      @default(1)
  canonicalVersion Int      @default(1)
  createdAt        DateTime                    // GERADO PELA APP antes do hash; nunca @default(now()) no hash
  @@unique([scopeUserId, unitId, seq])
  @@unique([scopeUserId, unitId, hash])
  @@index([scopeUserId, unitId, createdAt])
  @@index([scopeUserId, unitId, targetType, targetId])
  @@index([actorUserId, createdAt])
  @@index([eventType, createdAt])
  @@map("audit_events")
}

model AuditChainHead {
  scopeUserId String
  unitId      String
  nextSeq     BigInt
  headHash    String
  version     Int      @default(0)
  updatedAt   DateTime @updatedAt
  @@id([scopeUserId, unitId])
  @@map("audit_chain_heads")
}
```

**Sem `updatedAt`/`deletedAt` em `AuditEvent`.** Sem FK cascade em `scopeUserId`/`actorUserId`.

---

## 2. Matriz de eventos

| # | `eventType` | `targetType` | `targetId` | Call site | Payload fields | Campos proibidos |
|---|---|---|---|---|---|---|
| 1 | `entry.posted` | `journal_entry` | `entry.id` | `PostingService.postEntry` (in-tx, após create) | `sourceType`, `sourceId?`, `description`, `sumDebitCents`, `lineCount` | nenhum dado de posting individual, PII |
| 2 | `entry.reversed` | `journal_entry` | `reversal.id` | `PostingService.reverseEntry` (in-tx, após creates) | `originalId`, `reversalId`, `reason?` | legs individuais, PII |
| 3 | `account.created` | `account` | `account.id` | `PostingService.createAccount` (in-tx, após create) | `code`, `name`, `nature`, `acceptsEntries` | — |
| 4 | `account.deleted` | `account` | `accountId` | `PostingService.deleteAccount` (in-tx, após softDelete) | `code` | — |
| 5 | `period.opened` | `accounting_period` | `period.id` | `PeriodService.openPeriod` (in-tx, após setStatus) | `year`, `month`, `fromStatus`, `toStatus: "OPEN"` | — |
| 6 | `period.soft_closed` | `accounting_period` | `period.id` | `PeriodService.softClosePeriod` (in-tx, após setStatus) | `year`, `month`, `fromStatus`, `toStatus: "SOFT_CLOSED"`, `reason?` | — |
| 7 | `period.hard_closed` | `accounting_period` | `period.id` | `PeriodService.hardClosePeriod` (in-tx, após setStatus) | `year`, `month`, `fromStatus`, `toStatus: "HARD_CLOSED"`, `reason?` | — |
| 8 | `period.reopened` | `accounting_period` | `period.id` | `PeriodService.reopenPeriod` (in-tx, após setStatus) | `year`, `month`, `fromStatus`, `toStatus: "OPEN"`, `reason?` | — |

**Excluídos deliberadamente:**
- `ensureChartOfAccounts` (seeding técnico, sem relevância de auditoria)
- Bridges (re-acionam o choke-point que já emite — bridge emitir seria duplicata)
- `period.seedYear` (operação técnica de setup, não transição de estado)

---

## 3. Payload canonical — formato e allowlist

### 3.1 Tupla canonical versionada (entra no hash)

```typescript
interface CanonicalTuple {
  v:               "audit.v1"          // canonical version marker
  eventId:         string              // id do AuditEvent (cuid gerado antes de inserir)
  scopeUserId:     string
  unitId:          string
  seq:             string              // BigInt.toString()
  actorUserId:     string | null
  actorType:       string
  eventType:       string
  targetType:      string
  targetId:        string
  payloadCanonical: string            // JSON.stringify(payloadObj, sortedKeys)
  createdAtISO:    string             // app-set ISO-8601 antes de inserir
  prevHash:        string
}
// hash = sha256(JSON.stringify(tuple, null, 0))  ← sem spaces, sem undefined
```

### 3.2 Sanitização do payload (allowlist estrita por eventType)

```typescript
// Regra: switch(eventType) → pick SOMENTE os campos da lista acima.
// Nunca: token, password, request body bruto, Date object, BigInt bruto,
//        stacktrace, internal ids de outros domínios, dados de postings individuais.
// Dinheiro: SEMPRE string ("10000"), nunca number.
// Ausente/undefined: omitir a chave (JSON.stringify filtra automaticamente).
```

### 3.3 Exemplos canonical (JSON de payload, não da tupla)

**`entry.posted`**
```json
{ "sourceType": "manual", "description": "Venda à vista", "sumDebitCents": "10000", "lineCount": "2" }
```

**`entry.reversed`**
```json
{ "originalId": "entry-1", "reversalId": "rev-1", "reason": "erro de lançamento" }
```

**`account.created`**
```json
{ "code": "9.1", "name": "Conta teste", "nature": "Asset", "acceptsEntries": "true" }
```

**`account.deleted`**
```json
{ "code": "9.1" }
```

**`period.soft_closed`**
```json
{ "year": "2026", "month": "6", "fromStatus": "OPEN", "toStatus": "SOFT_CLOSED", "reason": "Fim do mês" }
```

> Todos os valores numéricos são strings na serialização canonical (evita ambiguidade BigInt/Int/Float).

---

## 4. Protocolo de concorrência — AuditChainHead

**Decisão:** `AuditChainHead` (registro por `(scopeUserId, unitId)` com `nextSeq` + `headHash` + `version`).

### 4.1 Algoritmo de append (dentro da mesma tx que a mutação)

```
1. readHead(scope, tx)
   → se não existir: GENESIS (nextSeq=1, headHash="0".repeat(64))
   → se existir: usar nextSeq, headHash

2. seq = head.nextSeq
   prevHash = head.headHash
   createdAt = new Date()   ← app, antes do hash
   eventId = cuid()         ← gerado pela app

3. payloadCanonical = sanitize(eventType, payloadObj)

4. tuple = { v: "audit.v1", eventId, scopeUserId, unitId,
             seq: seq.toString(), actorUserId, actorType,
             eventType, targetType, targetId,
             payloadCanonical, createdAtISO: createdAt.toISOString(), prevHash }

5. hash = sha256(JSON.stringify(tuple))

6. append(tx): INSERT INTO audit_events { ...fields }
   → P2002 em @@unique([scopeUserId,unitId,seq]) ou hash → NUNCA engolido → propagate → rollback tx inteira

7. bumpHead(scope, nextSeq: seq+1n, headHash: hash, version: head.version, tx)
   → UPDATE WHERE version = head.version   ← optimistic lock
   → P2002 / 0 rows → rollback tx inteira
```

### 4.2 Genesis

```typescript
const GENESIS_HASH = "0".repeat(64);
// Primeira head criada on-demand no primeiro append:
// INSERT INTO audit_chain_heads (scopeUserId, unitId, nextSeq, headHash, version)
// VALUES (scope.scopeUserId, scope.unitId, 1, GENESIS_HASH, 0)
// ON CONFLICT DO NOTHING  ← idempotente; P2002 = outra tx criou, bumpHead corrige
```

### 4.3 P2002 é propagado — nunca engolido

```typescript
// Se append ou bumpHead jogar P2002:
//   → throw para fora do runTransaction
//   → PostingService/PeriodService não capturam P2002 do audit
//   → a tx de mutação (entry, account, period) faz rollback junto
// Razão: P2002 em seq/hash = race de seq → bug na lógica de head;
//        não é um cenário benigno como o P2002 de sourceId (idempotência de negócio).
```

---

## 5. verifyAuditChain — contrato de resultado

```typescript
interface VerifyResult {
  ok:            boolean
  checkedEvents: number
  firstSeq:      bigint | null
  lastSeq:       bigint | null
  headHash:      string | null
  failure?: {
    seq:    bigint
    reason: 'MISSING_GENESIS' | 'SEQ_GAP' | 'PREV_HASH_MISMATCH' | 'HASH_MISMATCH' | 'HEAD_MISMATCH'
  }
}
```

**Verificações em ordem:**
1. Seq começa em 1 (genesis); caso contrário → `MISSING_GENESIS`
2. Sem buraco (seq[i+1] = seq[i]+1) → `SEQ_GAP`
3. prevHash[seq=1] = GENESIS_HASH → `PREV_HASH_MISMATCH`
4. prevHash[seq=N] = hash[seq=N-1] → `PREV_HASH_MISMATCH`
5. hash recomputado bate com armazenado → `HASH_MISMATCH`
6. headHash = hash[último] AND head.nextSeq = último+1 → `HEAD_MISMATCH`

Nenhum endpoint público obrigatório no INCR-2 — existe como `AuditService.verifyAuditChain(scope)`.

---

## 6. Ripple em `PostingService` e `PeriodService`

### PostingService (+6º arg `IAuditRepository` via `AuditService`)
- **`createAccount` e `deleteAccount`** precisam ser envolvidos em `runTransaction` para que o audit seja atômico. Preservar mapeamento P2002→ValidationError **dentro** da nova tx (o catch atual em createAccount captura P2002 dentro do try → continua funcionando).
- **`postEntry`**: append `entry.posted` in-tx, após `journalEntryRepo.create`.
- **`reverseEntry`**: append `entry.reversed` in-tx, após `journalEntryRepo.setReversedBy`.
- Tentativa falha **nunca emite audit** (rollback conjunto).

### PeriodService (+injeção de AuditService)
- `openPeriod`, `softClosePeriod`, `hardClosePeriod`, `reopenPeriod`: append do evento correspondente in-tx, após `periodRepo.setStatus`.
- `seedYear`: **NÃO audita** (setup técnico).
- `reopenPeriod` de HARD_CLOSED lança antes de chegar ao tx → **sem audit** (correto).

---

## 7. Suite de testes obrigatória

| Caso | Asserção |
|---|---|
| Genesis (seq=1) | prevHash = GENESIS_HASH; tupla correta; verify ok |
| Encadeamento (seq=2) | prevHash do seq=2 = hash do seq=1 |
| Atomicidade post ok | entry.posted emitido in-tx; verify ok |
| Atomicidade post falha (throw no journalEntryRepo.create) | nenhum audit; verify ok (sem evento) |
| Append falha (P2002 em seq) | entry não Posted; P2002 propagado; sem audit |
| `createAccount` P2002 (code dup) | ValidationError preservado; sem audit |
| `deleteAccount` bloqueado (postings) | 409 preservado; sem audit |
| Período: open/soft_close/hard_close/reopen | 1 evento cada in-tx; verify ok |
| `reopenPeriod` de HARD_CLOSED | ValidationError antes da tx; sem audit |
| Concorrência (2 appends mesmo scope, tx serializadas) | seqs distintos e encadeados; verify ok |
| `verifyAuditChain` payload alterado | HASH_MISMATCH |
| `verifyAuditChain` prevHash alterado | PREV_HASH_MISMATCH |
| `verifyAuditChain` linha removida | SEQ_GAP |
| `verifyAuditChain` head divergente | HEAD_MISMATCH |
| Sanitização: token/password no payload | campo ausente ou mascarado; não entra no hash |
| `sumDebitCents` como número | erro ou convertido para string antes do hash |
| reverseEntry (entry.reversed) | `originalId` + `reversalId` no payload; 1 único evento |

---

## 8. Checklist de gates antes de merge

```
[ ] Prisma schema + migração aplicada clean (sem dev.db corrompido)
[ ] tsc limpo (server + my-app)
[ ] Jest verde (sem regredir os 525 existentes)
[ ] verifyAuditChain implementado e coberto pelos testes acima
[ ] Todos os 8 eventTypes cobertos por ao menos 1 teste
[ ] P2002 de append nunca engolido (testado explicitamente)
[ ] createAccount/deleteAccount transacionais (erro preservado)
[ ] Payload sem token/password/PII (sanitização testada)
[ ] skill-audit wiring (factory 6-toques, rota se endpoint exposto)
[ ] npm run docs:generate (se houver endpoint novo)
[ ] Review por agente independente (PASS da mesma sequência = rejeitado)
```

---

## 9. Riscos e tetos

| Risco | Mitigação |
|---|---|
| `createAccount/deleteAccount` reestruturados em tx | P2002 catch continua inside do try — rollback fecha junto; testes explícitos |
| `createdAt` gerado pela app antes do hash | não usar `@default(now())` do Prisma no campo que entra no hash |
| append em tx já fechada | `append(input, tx)` exige `Prisma.TransactionClient` por assinatura |
| Concorrência SQLite (WAL) | AuditChainHead com optimistic lock; P2002 → propagate; não retry silencioso |
| Big-test de concorrência flaky | Rodar em SQLite isolado; não paralelizar com outros suites |

**Teto explícito (ponytail):**
- Sem endpoint `GET /accounting/audit` neste incremento (teto: INCR-2 maduro)
- Sem `DailyAuditAnchor` externo (teto: endurecimento tamper-proof futuro)
- Allowlist via `switch(eventType)` (teto: mapa se cobertura crescer)
