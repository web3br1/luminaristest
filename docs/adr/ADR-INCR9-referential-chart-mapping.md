# ADR-INCR9 — Plano de Contas Referencial versionado (ReferentialMapping)

- **Status:** Accepted — decisões tomadas pelo agente com base no parecer `luminaris-accounting-architect` + master map + leitura de código (CBM-001). Implementação a seguir (ordem ideal: ADR → impl → review independente).
- **Date:** 2026-07-09
- **Decision class:** PRISMA_FIRST_CLASS (camada de mapeamento/compliance; nunca DynamicTable — Contrato §2.1, T3). **Não** muda valor de ledger — é descritiva, ao lado do plano de contas.
- **Depends on:** INCR-B (`Account`, `acceptsEntries`, code hierárquico), INCR-4 (`AccountingReportService` — padrão `mappingVersion`+`unmappedAccounts`), INCR-2 (`AuditEvent`/`AuditService.append`), INCR-8 (proveniência — o gate §5 que destrava ECD/ECF). Todos em `main`.
- **Escopo (fonte):** `docs/accounting/BE-INCR9-referential-chart-mapping-scope-brief.md` · **Roadmap:** `docs/accounting/ACCOUNTING-MASTER-MAP.md` §5 (nó "ECD/ECF readiness" — este ADR entrega o pré-requisito "mapeamento referencial versionado")
- **Supersedes:** none · **Related:** ADR-INCR4 (forma `mappingVersion`+diagnóstico, reusada; conteúdo distinto) · ADR-INCR8 (proveniência, o outro pré-requisito ECD/ECF)

> **Nota de processo.** ADR escrito **antes** do código. Governança T12: PLAN → ADR → BRIEF → impl → test → review independente (worktree separado) → PR → smoke-migration-gate → closeout → memória. Divergências vs. o modelo *proposto* no brief de entrada estão marcadas **[REFINA O BRIEF]** com o porquê.

---

## 1. Contexto

**ECD/ECF (SPED Contábil / Fiscal) exige que cada conta-folha do plano interno seja mapeada a uma
conta REFERENCIAL da RFB** (Bloco I050/I051 da ECD; leiaute referencial publicado por ano-calendário).
O leiaute referencial **muda por ano-calendário** — logo o mapeamento é **versionado**: a mesma conta
interna pode apontar para códigos referenciais diferentes em 2025 e 2026.

**Não existe `ReferentialMapping` hoje** (grep vazio — CBM-001). O plano de contas (`Account`,
`schema.prisma:384-403`) tem `code` hierárquico, `nature`, `acceptsEntries` (só folha recebe
lançamento) e `@@unique([userId,unitId,code])`. Os dois pré-requisitos que o master map §5 nomeia para
ECD/ECF — **proveniência formal** (INCR-8) e **mapeamento referencial versionado** (este ADR) — passam
a existir; a **geração do arquivo SPED** (blocos/registros, assinatura digital, importação do leiaute
oficial) segue **diferida a ADR próprio**.

**Padrão canônico a reusar (forma, não conteúdo):** `AccountingReportService` (INCR-4) já modela
"mapeamento versionado + diagnóstico de não-mapeados": `mappingVersion` + `DiagnosticsShape.
unmappedAccounts[]` (`AccountingReportService.ts:72-85,244-306`). Aquele mapeia `natureza→linha de
BP/DRE`; este mapeia `Account→código RFB`. A **shape** do diagnóstico é reusada; a lógica de membership é
distinta e **crítica** (§2 D3).

**Objetivo (MVP):** entregar só (a) o mapeamento versionado `Account→referencialCode` e (b) o
**diagnóstico de cobertura** (quais contas-folha ativas estão sem mapeamento numa versão) — o gate de
"prontidão ECD". Nenhum valor de ledger muda.

**Invariantes herdados (do parecer, aplicáveis):** ACC-011/012 (gate in-tx + tx propagada),
ACC-019/020 (auditoria in-tx, exceção ao cascade), ACC-021 (leitura read-only) — com a ressalva de
domínio de que a cobertura é **chart-driven**, não gateada por POSTED (§2 D3).

---

## 2. As decisões

### D1 — `mappingVersion` é **STRING LIVRE**, não enum Prisma  **[REFINA O BRIEF]**

**Decisão:** `mappingVersion: String` (ex.: `"2025"`, `"ECD-2025"`). Validação de shape (não-vazio,
trim) no DTO Zod `.strict()`; **não** é enum no schema.

**Por quê (vencedor):** o leiaute referencial da RFB é **dado que muda por ano-calendário**, não
schema. Um enum forçaria uma **migração a cada novo leiaute** — exatamente a rotatividade que o
versionamento existe para absorver. **Descartado:** enum/tabela-de-versões — custo de migração
recorrente sem ganho de integridade (a versão não tem invariante que o banco precise garantir além da
`@@unique` composta).

### D2 — Coexistência de versões via **`@@unique([userId, unitId, accountId, mappingVersion])`**

**Decisão:** uma conta tem **no máximo um** código referencial **por versão**, e **quantas versões
quiser**. A chave composta inclui `mappingVersion` → `v2025` e `v2026` da mesma conta coexistem sem
colidir. Espelha `Account.@@unique([userId,unitId,code])`.

**Por quê:** é o invariante-núcleo do versionamento. `@@index([userId, unitId, mappingVersion])` serve
o read de cobertura (todos os mapeamentos de uma versão num scope). **Descartado:** `@@unique` sem
`mappingVersion` — impediria a coexistência que é o propósito do incremento.

### D3 — Cobertura é **chart-driven**, NUNCA balance-driven  **[REFINA O BRIEF — correção de domínio]**

**Decisão:** o conjunto "faltando mapeamento" numa versão é:
```
faltando(version) = { Account | deletedAt = null ∧ acceptsEntries = true }  MINUS
                    { accountId com ReferentialMapping na version }
```
Membership vem de `accountRepo.findManyByUnit(scope)` (já lista contas ativas ordenadas por `code`).
`groupByAccount` (INCR-4) **só pode enriquecer** cada linha faltante com saldo (informativo) — **jamais
decidir quem entra**.

**Por quê:** ECD mapeia **toda conta-folha ativa do plano**, tenha ou não movimento no período — uma
conta-folha de saldo zero e sem posting **ainda precisa** de código referencial. Gatear a cobertura em
"só contas com posting" (reusando `groupByAccount` como filtro) faria contas-folha sem movimento
**sumirem**, e o gate de prontidão passaria **falsamente**. **ACC-021** ("só POSTED em relatório
oficial") aplica-se a **relatórios de dinheiro** (BP/DRE), **não** à membership de cobertura, que é
completude-de-plano — ortogonal a status de posting. **Descartado:** cobertura balance-driven — é o
erro fácil e silencioso (teste de domínio obrigatório o pega).

### D4 — Só **conta-folha** (`acceptsEntries=true`) mapeia; agrupamento é excluído, não herda

**Decisão:** contas de agrupamento (`acceptsEntries=false`, os nós internos da hierarquia por `code`)
**não** são mapeadas e **não** contam como faltantes. ECD mapeia contas analíticas (folha); as
sintéticas são estruturais.

**Por quê:** `acceptsEntries` já é o marcador de folha (`schema.prisma:392`, "Only leaf accounts
receive ledger lines"). **Descartado:** herança de mapeamento pelo prefixo de `code` — não é o modelo
ECD (I051 lista contas analíticas) e introduziria lógica de árvore que o schema deliberadamente não
tem (hierarquia é só o prefixo do `code`, sem self-relation).

### D5 — **SEM `deletedAt`**: hard-delete + trilha no `AuditEvent`  **[REFINA O BRIEF]**

**Decisão:** `ReferentialMapping` **não** tem soft-delete. Mudar mapeamento = **update-in-place**
(`referentialCode`/`label` sobrescritos); desmapear = **hard-delete**. O histórico da mudança vive no
`AuditEvent` (hash-chain, T8), via `AuditService.append` na mesma tx do write.

**Por quê:** com `deletedAt`, a `@@unique([...,mappingVersion])` cobriria linhas soft-deletadas (SQLite
não tem índice parcial) → remapear-após-desmapear na mesma versão morreria em P2002 — exatamente o
class-bug `unique-de-idempotencia-x-soft-delete`. Um mapeamento é uma **projeção de estado corrente**,
não um documento com ciclo de vida próprio; a trilha requerida (ACC-020) é satisfeita pelo hash-chain.
Hard-delete elimina a armadilha na raiz e mantém o model mínimo (ponytail). **Descartado:** soft-delete
com rename-on-delete (`deleted:<id>`) — complexidade sem consumidor (nenhum path precisa "restaurar"
um mapeamento; re-set recria).

### D6 — `referentialCode` + `label` são **strings livres denormalizadas**; SEM tabela-catálogo/FK

**Decisão:** `referentialCode: String` (o código RFB) e `label: String` (nome da conta referencial,
**snapshot denormalizado** no momento do mapeamento). **Não** há tabela-catálogo do leiaute referencial
nem FK a ela neste incremento. O DTO valida shape (não-vazio), **não** pertinência ao catálogo oficial.

**Por quê:** importar/validar o leiaute referencial oficial da RFB é **diferido junto com a geração
SPED** (out of scope). O `label` denormalizado por versão é o comportamento **correto** para ECD
histórica (a versão v2025 preserva o rótulo vigente em 2025 mesmo que o de 2026 mude). **Descartado:**
FK a um `ReferentialAccount` catálogo — exigiria seed/import do leiaute oficial, que é o próprio
trabalho diferido; força shape especulativo pré-SPED (YAGNI).

### D7 — Tenancy: mesmo `AccountingScope`; `userId` **com** cascade (a trilha é o AuditEvent)

**Decisão:** `ReferentialMapping.userId` + `unitId` scoped por `accountingScopeWhere`. `userId` → `User`
`onDelete: Cascade` (igual `Account`, `schema.prisma:387`). `accountId` → `Account` FK (a conta é
soft-deletada, nunca hard-deletada, então o cascade é inócuo). Sem torre multiempresa (T2).

**Por quê:** o mapeamento **não** é trilha de auditoria — a trilha (exceção ao cascade, ACC-020) vive
no `AuditEvent`. Apagar um usuário pode apagar seus mapeamentos junto (são estado corrente
regenerável); o registro histórico da mudança persiste no hash-chain. **Descartado:** no-cascade no
mapeamento — trataria projeção-de-estado como evidência, divergindo de `Account` sem motivo.

### D8 — Write transacional com **gate in-tx** (ACC-011/012/019)

**Decisão:** `setMapping`/`unsetMapping` abrem `runTransaction` e, **dentro** dela: (1) carregam o
`Account` por id **na tx** e re-afirmam `scope + deletedAt=null + acceptsEntries=true`; (2)
upsert/delete do mapeamento via repo com `tx` propagado; (3) `AuditService.append(tx, scope,
{eventType:'referential.mapping.set'|'referential.mapping.unset', targetType:'ReferentialMapping',
targetId, payload:{accountId, referentialCode, mappingVersion}})` na **mesma tx**.

**Por quê:** `acceptsEntries`/`deletedAt` do `Account` são **invariantes mutáveis** — a conta pode ser
soft-deletada concorrentemente ao write do mapeamento; preflight + `@@unique` **não** fecham a corrida
(T6). Auditoria in-tx (ACC-019): rollback do write reverte o append. **Descartado:** validar o Account
fora da tx (preflight só) — TOCTOU `map × softDelete`.

---

## 3. Modelo Prisma final (sujeito ao smoke-migration-gate)

```prisma
// Mapeamento Plano-de-Contas → conta REFERENCIAL da RFB, VERSIONADO por ano-calendário (BE-INCR-9 /
// ADR-INCR9). First-class Prisma — camada DESCRITIVA/compliance ao lado do plano de contas. NÃO muda
// valor de ledger. Tenancy = AccountingScope (userId+unitId). SEM deletedAt (D5: hard-delete + trilha
// no AuditEvent). O código/rótulo referencial são strings denormalizadas — não há catálogo/FK no MVP
// (D6, importação do leiaute oficial diferida com a geração SPED).
model ReferentialMapping {
  id              String   @id @default(cuid())
  userId          String   // AccountingScope.ownerUserId
  user            User     @relation(fields: [userId], references: [id], onDelete: Cascade) // D7
  unitId          String   // business unit (scoped string, not a FK)
  accountId       String
  account         Account  @relation(fields: [accountId], references: [id]) // conta-folha mapeada (D4)
  referentialCode String   // código da conta referencial RFB (string livre — D6)
  label           String   // nome da conta referencial, snapshot denormalizado por versão (D6)
  mappingVersion  String   // leiaute referencial por ano-calendário, string livre (D1) — ex. "2025"
  createdById     String?  // ator (AccountingScope.actorUserId); plain string
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  // Uma conta tem no máximo 1 código referencial por versão; várias versões coexistem (D2).
  @@unique([userId, unitId, accountId, mappingVersion])
  @@index([userId, unitId, mappingVersion])
  @@map("referential_mappings")
}
```

Back-relation a adicionar em `Account`: `referentialMappings ReferentialMapping[]`.
Back-relation a adicionar em `User`: `referentialMappings ReferentialMapping[]` (segue o padrão das
demais relações User-scoped com cascade).

**Migração:** aditiva — `CREATE TABLE referential_mappings` + índices. Zero ALTER em tabelas
existentes (só as back-relations, que não geram coluna). Tabela nova vazia → blast radius mínimo.

---

## 4. Superfície de API (MVP)

Rotas `/api/accounting/referential/*` (3-toques, OpenAPI JSDoc):

| Método | Rota | Policy | Efeito |
|---|---|---|---|
| `PUT` | `/referential/mappings` | `canManageReferential` | set (upsert) mapeamento `{accountId, referentialCode, label, mappingVersion}` — gate in-tx + audit |
| `DELETE` | `/referential/mappings` | `canManageReferential` | unset (hard-delete) `{accountId, mappingVersion}` — audit |
| `GET` | `/referential/mappings?version=` | `canReadReferential` | lista mapeamentos da versão no scope |
| `GET` | `/referential/coverage?version=` | `canReadReferential` | diagnóstico de cobertura (mappingVersion + unmappedAccounts[]) |

`canReadReferential`/`canManageReferential` estendem `IAccountingPolicy` (reusam o shape de
`canRead`/`canManage`).

---

## 5. Definition of Done / gates de teste (domínio)

- `tsc` limpo (2 pacotes) · Jest **verde sem regredir** · `docs:generate` (rota nova) · skill-audit
  `wiring` · **smoke-migration-gate** sobre backup do `dev.db` real (`accounting-incr1-db-risk`) ·
  review por **agente independente** (worktree isolado, T12).
- **Testes obrigatórios:**
  - **Versionar (D2):** mapear a **mesma** conta em `v2025` e `v2026` coexiste; ler por versão devolve
    o par certo; a `@@unique` não colide entre versões.
  - **Cobertura chart-driven (D3) — o teste que pega o erro fácil:** conta-folha ativa de **saldo zero
    e sem posting** APARECE como faltante; conta de agrupamento (`acceptsEntries=false`) **não** aparece;
    conta mapeada some da lista.
  - **Idempotência do set (D2):** re-set do mesmo `(accountId, version)` com código diferente
    **atualiza** (update-in-place), não duplica nem lança P2002.
  - **Concorrência (D2):** dois `setMapping` concorrentes do mesmo `(accountId, version)` → um vence,
    o outro resolve sem corromper (upsert/P2002 controlado).
  - **Gate in-tx (D8):** mapear conta **soft-deletada** → falha **dentro da tx** (`NotFoundError`/
    `ValidationError`), nenhum mapeamento órfão persiste.
  - **Auditoria in-tx (D8):** cada set/unset grava `AuditEvent` na **mesma tx**; rollback do write
    reverte o append (nenhum evento sem mapeamento, nenhum mapeamento sem evento).
  - **Tenancy (D7):** mapeamento/cobertura de outro `userId`/`unitId` invisível; read cross-unit não
    vaza.
  - **Hard-delete (D5):** unset remove a linha; re-set na mesma versão recria sem P2002 (prova de que
    não há tombstone).
- **Invariante de fechamento:** **nenhuma** escrita em `Posting`/débito/crédito/`JournalEntry` pela
  camada de mapeamento — prova de que nenhum valor de ledger muda.

---

## 6. Rejeitados (resumo "por quê / vencedor")

| Alternativa | Vencedor | Motivo |
|---|---|---|
| `mappingVersion` enum / tabela-de-versões | String livre | Leiaute RFB é dado por ano-calendário; enum força migração recorrente (D1) |
| `@@unique` sem `mappingVersion` | Chave com `mappingVersion` | Impediria a coexistência de versões que é o propósito (D2) |
| Cobertura balance-driven (`groupByAccount` filtra membership) | Chart-driven (`findManyByUnit`) | Conta-folha sem movimento sumiria; gate de prontidão passaria falso (D3) |
| Herança de mapeamento por prefixo de `code` | Só folha mapeia, agrupamento excluído | Não é o modelo ECD (I051 = analíticas); schema não tem árvore (D4) |
| `deletedAt` (soft-delete) | Hard-delete + trilha no AuditEvent | `@@unique` cobre tombstone → P2002 no remap (class-bug); mapeamento é projeção, não documento (D5) |
| FK a catálogo `ReferentialAccount` | `referentialCode`/`label` strings denormalizadas | Exigiria import do leiaute oficial = trabalho diferido; shape especulativo pré-SPED (D6) |
| No-cascade no mapeamento | `userId` com cascade (como Account) | Mapeamento é estado regenerável, não evidência; a trilha é o AuditEvent (D7) |
| Validar Account fora da tx (preflight só) | Gate in-tx | TOCTOU `map × softDelete`; `acceptsEntries`/`deletedAt` são mutáveis (D8) |
