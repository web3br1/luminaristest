# ADR-INCR2 — AuditEvent append-only (hash-chain, tamper-evident)

- **Status:** Accepted with amendments (ratificado 2026-06-27) — as emendas §"Emendas obrigatórias" PREVALECEM
- **Date:** 2026-06-27
- **Decision class:** PRISMA_FIRST_CLASS (invariante de integridade: append-only + chain)
- **Depends on:** INCR-1 (auditoria DEVE cobrir eventos de período)
- **Plano:** `docs/accounting/PLANEJAMENTO-buildout-contabil.md` §3 INCR-2
- **Related:** ADR-INCR1 (`AccountingPeriodTransition` é histórico funcional; `AuditEvent` é trilha geral)

## Context

Não há log de auditoria hoje (só `createdById`/`postedById`, mutáveis na mesma linha). A tx
contábil é aberta no repo (`PostingRepository.runTransaction`), então o append pode commitar
atomicamente com a mutação. Direção aprovada; **ratificação condicionada às 9 emendas.**

> **Threat model (explícito).** A hash-chain é **tamper-evident, NÃO tamper-proof**: protege
> contra mutação acidental pela aplicação e detecta alteração parcial (payload/seq/prevHash/
> ordem/remoção de linha). **Não** protege contra operador com acesso direto ao DB capaz de
> reescrever a chain inteira e recalcular todos os hashes. Endurecimento futuro: âncora externa
> periódica (`DailyAuditAnchor`).

## Decisão ratificada (com emendas)

| # | Questão | Decisão |
|---|---|---|
| Q1 | Enforcement append-only (SQLite) | **Convenção-only** (repo sem update/delete) no MVP — **mas** threat model documentado **e `verifyAuditChain` obrigatório no INCR-2**. Trigger SQL `RAISE` em UPDATE/DELETE = upgrade. |
| Q2 | Hash + canonical | `sha256(JSON.stringify(canonicalTuple))` com tupla **versionada** incluindo `audit.v1`, `eventId`, `scopeUserId`, `unitId`, `seq` (string), `actorUserId`, `actorType`, `eventType`, `targetType`, `targetId`, `payloadCanonical`, `createdAtISO`, `prevHash`. `prevHash` **dentro** da tupla (sem concat por pipe). |
| Q3 | Granularidade da chain | **Uma chain por `(scopeUserId, unitId)`**. |
| Q4 | reverseEntry | **1 evento** `entry.reversed` (`{originalId, reversalId}`). |
| Q5 | Unicidade + tipo de seq | `@@unique([scopeUserId,unitId,seq])` + `@@unique([scopeUserId,unitId,hash])`. **`seq BigInt`** (log permanente). |
| Q6 | FK do ator/escopo | **Sem FK cascade destrutivo.** `scopeUserId`/`actorUserId` escalares imutáveis; se FK, `onDelete: SetNull`/`Restrict`. Deletar usuário **não** apaga trilha. |
| Q7 | Eventos de período | **Auditar `period.opened/soft_closed/hard_closed/reopened`** (além de entry/account), já que INCR-1 existe. |
| Q8 | Payload | **String canonicalizada allowlistada por eventType** (chaves ordenadas, sem `undefined`/`Date`/`BigInt` bruto, dinheiro como **string**, sem token/senha/PII/request body). |
| Q9 | createdAt | **Gerado pela aplicação ANTES do hash** (`createdAtISO`), nunca `@default(now())` do banco para o hash. |
| Q10 | Append fora de tx | **Proibido.** `append(input, tx)` exige `Prisma.TransactionClient`. |
| Q11 | Concorrência/P2002 | **`AuditChainHead`** (head por `(scopeUserId,unitId)` com `nextSeq`/`headHash`/`version`) **OU** rollback+retry da transação inteira. **P2002 nunca é engolido.** |
| Q12 | Verify | **`verifyAuditChain(scope)` nasce no INCR-2** (sem endpoint público obrigatório). |
| Q13 | create/deleteAccount | Transacionais, **preservando o mapeamento de erro atual** (P2002 duplicata → ValidationError); tentativa falha **não** emite audit. |

## Emendas obrigatórias (bloqueantes)

1. `AuditEvent` **sem FK cascade** para usuário (auditoria não pode ser apagada por delete de user).
2. **Auditar eventos de período** (`period.*`) — a lista original contradizia o "depends on INCR-1".
3. Declarar **tamper-evident**, não tamper-proof (+ threat model).
4. Canonical com **`eventId`, `hashVersion`, `canonicalVersion`, `createdAtISO` controlado pela app**.
5. **Payload = string canonical allowlistada** (não JSON arbitrário, não `Prisma.Json`, não request body).
6. **Protocolo de concorrência explícito** (`AuditChainHead` ou retry da tx inteira) — não inferir do `orderBy seq desc` solto.
7. **`verifyAuditChain` implementado no INCR-2** (a chain sem verify não se prova).
8. **P2002 de append nunca engolido** (rollback+retry, não swallow).
9. **`seq BigInt`** desde já.

## Modelo ratificado

```prisma
model AuditEvent {
  id          String @id @default(cuid())
  scopeUserId String
  unitId      String
  seq         BigInt
  actorUserId String?
  actorType   String @default("USER")   // USER | SYSTEM | SERVICE_ACCOUNT
  eventType   String
  targetType  String
  targetId    String
  payload     String                     // canonical, allowlistada
  prevHash    String
  hash        String
  hashVersion      Int @default(1)
  canonicalVersion Int @default(1)
  createdAt   DateTime                    // ISO gerado pela app (entra no hash)
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
  version     Int @default(0)
  updatedAt   DateTime @updatedAt
  @@id([scopeUserId, unitId])
  @@map("audit_chain_heads")
}
```

Genesis: `GENESIS_HASH = "0".repeat(64)`; primeira head `nextSeq=1, headHash=GENESIS_HASH`.
Eventos auditados: `entry.posted`, `entry.reversed`, `account.created`, `account.deleted`,
`period.opened`, `period.soft_closed`, `period.hard_closed`, `period.reopened`.
Excluídos: `ensureChartOfAccounts` (seeding técnico — opcional `chart_of_accounts.seeded`
agregado) e bridges (re-acionam o choke-point que já emite).

## verifyAuditChain — resultado

`ok`, `checkedEvents`, `firstSeq/lastSeq`, `headHash`, `failure?{seq, reason}` com
`reason ∈ {MISSING_GENESIS, SEQ_GAP, PREV_HASH_MISMATCH, HASH_MISMATCH, HEAD_MISMATCH}`.
Verifica: seq inicia em 1, sem buraco, prevHash[1]=genesis, encadeamento, hash recomputado,
headHash=último, nextSeq=último+1.

## Testes obrigatórios

- Construção: seq 1 (genesis) → seq 2 (prevHash=hash anterior).
- Verify: intacta=ok; payload/hash/prevHash alterado, linha removida, head divergente → reason correto.
- Atomicidade: post ok → entry.posted; post falha → nenhum audit; append falha → entry não Posted.
- Conta: create P2002 → sem audit + erro preservado; delete bloqueado por uso → sem audit.
- Período: open/soft/hard/reopen → evento; reopen de HARD_CLOSED → sem audit.
- Concorrência: dois appends no mesmo scope → seqs distintos, encadeados, verify ok.
- Sanitização: token/password/requestBody/BigInt bruto → rejeitado ou convertido.

## Checklist de ratificação (revisado)

- [ ] Q1 Convenção-only no MVP + threat model + verify obrigatório
- [ ] Q2 Canonical com `audit.v1`, eventId, scopeUserId, unitId, seq(string), actor, tipos, payload, createdAtISO, prevHash
- [ ] Q3 Uma chain por (scopeUserId, unitId)
- [ ] Q4 reverseEntry = 1 evento
- [ ] Q5 `@@unique` por seq e hash; `seq BigInt`
- [ ] Q6 Sem FK cascade destrutivo
- [ ] Q7 Eventos de período auditados
- [ ] Q8 Payload canonical allowlistado, nunca request body
- [ ] Q9 `createdAt` gerado pela app antes do hash
- [ ] Q10 Append em tx obrigatório
- [ ] Q11 Protocolo de concorrência (`AuditChainHead` ou retry da tx); P2002 nunca engolido
- [ ] Q12 `verifyAuditChain` no INCR-2
- [ ] Q13 create/deleteAccount preservam mapeamento de erro atual
