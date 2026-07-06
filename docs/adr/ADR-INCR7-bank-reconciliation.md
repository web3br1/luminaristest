# ADR-INCR7 — Conciliação Bancária (Bank Reconciliation)

- **Status:** Accepted — 7 decisões ratificadas por delegação do usuário (web3br1) em **2026-07-03**. Implementação **não iniciada**.
- **Date:** 2026-07-03
- **Decision class:** PRISMA_FIRST_CLASS (módulo de controle com invariantes de idempotência/auditoria; nunca DynamicTable — Contrato §2.1)
- **Depends on:** INCR-1 (períodos), INCR-4 (relatórios), INCR-5 (anexos), INCR-6 (import — reusa só o parser `parseTable`). Módulo accounting em `main`.
- **Escopo (fonte):** `docs/accounting/BE-INCR7-reconciliation-scope-brief.md` · **Roadmap:** `docs/accounting/ACCOUNTING-MASTER-MAP.md` §3
- **Supersedes:** none · **Related:** ADR-INCR1 (gate de período), ADR-INCR4 (semântica de status em relatório)

> **Nota de processo.** Este ADR foi escrito **antes** de qualquer código (ordem ideal: ADR → impl → review).
> As 7 decisões abaixo foram delegadas pelo usuário ("já pode tomar as 7 decisões de acordo com toda a
> documentação") e tomadas pelo agente com base no parecer de domínio (`luminaris-accounting-architect`),
> no master map e na leitura do código (CBM-001). Divergências vs. o modelo *proposto* no brief estão
> marcadas **[DIVERGE DO BRIEF]** com o porquê.

---

## 1. Contexto

Não existe conciliação bancária hoje. O `JournalEntry.status` tem o valor `Reconciled` no enum de string
(`schema.prisma:415`) mas é **placeholder — nunca setado** (confirmado por grep). Existe um outro "reconcile"
não relacionado: o `AccountingSync` (job CRM Won→lançamento, `features/accounting/sync/`) — **não confundir**;
aquilo é backfill de integração, isto é casar extrato bancário com o razão.

**Objetivo (MVP):** dado um extrato bancário importado, casar cada linha com o(s) posting(s) existentes da
conta-banco, revisar/ajustar manualmente, e produzir um relatório de pendências (linhas sem match + postings
sem match). **Nenhum valor monetário de ledger muda** — a conciliação escreve nas tabelas de vínculo e flipa
`JournalEntry.status` `Posted↔Reconciled` (marcador de estado reversível e auditado — D5); nenhum
posting/débito/crédito é alterado. Ajuste real (tarifa, diferença) continua sendo lançamento novo via
`PostingService.postEntry`.

**Invariantes herdados** (do parecer, aplicáveis): ACC-011 gate in-tx (TOCTOU), ACC-012 tx propagada,
ACC-013 idempotência por identidade (não por `userId`), ACC-014 centavo Int + `MAX_CENTS`, ACC-018
estorno/unmatch soft, ACC-019/020 auditoria in-tx sem cascade, ACC-021 relatório as-of.

---

## 2. As 7 decisões

### D1 — Ingestão: **models próprios**, não novo `ImportKind`

**Decisão:** `BankStatement`/`BankStatementLine` são models próprios. Reusa-se **apenas** o parser puro
`lib/spreadsheet.parseTable` (já desacoplado do model de INCR-6). **Não** se cria `ImportKind
IMPORT_BANK_STATEMENT` no `AccountingDataExchangeJob`.

**Por quê (vencedor):** o `AccountingDataExchangeJob.kind` sempre resolve, no commit, em `targetType
ACCOUNT|JOURNAL_ENTRY` via `PostingService` (`DataExchangeImportService.ts:186-238`) — todo import daquele
motor **posta no ledger**. Extrato bancário **não posta nada** (liga). Forçá-lo naquele `kind` ramificaria os
validators/mappers ledger-específicos para um alvo que não é escrita de ledger, alargando o motor genérico
para um domínio que ele não modela — mesmo princípio de fronteira do §2.1 (aqui Prisma↔Prisma).
**Descartado:** reusar o pipeline de DataExchange — acopla formato bancário ao motor de posting.

### D2 — Formatos: **CSV/XLSX only** no MVP

**Decisão:** MVP aceita CSV/XLSX (via `parseTable`). OFX/CNAB/NF-e ficam para **ADR próprio**.

**Por quê:** zero dependência nova de parser; já fora de escopo no brief. **Descartado:** OFX no MVP — puxa
parser + mapeamento de leiaute bancário que é um subprojeto.

### D3 — Granularidade: **linha ↔ posting**, N:M estrutural, 1 match ativo por posting no MVP  **[parte DIVERGE DO BRIEF]**

**Decisão:** o vínculo é linha-do-extrato ↔ **posting** (não `journalEntry`). Tabela `ReconciliationMatch`
é N:M estrutural, mas o MVP impõe **"cada posting tem no máximo 1 match ativo"** (agregação *N postings ↔ 1
linha* permitida; *split 1 posting ↔ N linhas* diferido). `@@unique([statementLineId, postingId])` + gate
in-tx que rejeita casar um posting já ativamente casado.

**Por quê:** uma linha de extrato corresponde à perna da conta-banco (o posting em `accountId == conta banco`),
não à entry inteira (que tem outras pernas em outras contas). A regra "1 match ativo por posting" **fecha o
furo de idempotência**: mesmo que uma linha seja duplicada por re-import de arquivo diferente, o segundo match
sobre aquele posting é barrado no gate in-tx (ACC-011) — sem precisar de índice parcial (SQLite/Prisma não
expõem bem). **Descartado:** linha↔journalEntry (grosso demais, quebra quando a entry tem múltiplas pernas);
split livre no MVP (adia — precisa de saldo-alocado por posting).

### D4 — Conta-banco: **âncora no `Account` existente**

**Decisão:** `BankStatement.glAccountId` é FK para `accounts.id` (a conta contábil "banco", ex. `1.1.1.x`).
**Sem** entidade/metadado novo de "bank account".

**Por quê:** reusa `Account @@unique([userId,unitId,code])` + tenancy `AccountingScope` já provados; o
auto-match particiona por essa conta. **Descartado:** entidade "BankAccount" separada — duplicaria
isolamento que `Account`+scope já dão.

### D5 — `JournalEntry.status = Reconciled`: **NO MVP** (flip derivado, reversível, auditado) + **emenda obrigatória INCR-4**

**Decisão:** o MVP **seta** `JournalEntry.status = 'Reconciled'`, como **estado derivado**: um lançamento
`Posted` vira `Reconciled` (dentro da mesma tx do match) quando **todo posting seu que está numa conta-banco
conciliada tem match ativo**. Recomputado a cada match/unmatch; **reversível** (`Reconciled → Posted` quando
a condição deixa de valer — D7). O flip é **auditado** (`AuditEvent reconciliation.entry_reconciled` /
`reconciliation.entry_unreconciled`, mesma tx — ACC-019).

**Nenhum valor monetário muda** — o flip é um marcador de estado sobre a entry `Posted`, não uma edição de
posting/débito/crédito. Um lançamento `Reconciled` é economicamente idêntico a um `Posted`.

**[EMENDA INCR4-A — obrigatória, gate de merge]** Como `Reconciled` é economicamente idêntico a `Posted`,
`AccountingReportService.LEDGER_STATUSES` (`['Posted','Reversed']`, `AccountingReportService.ts:142`, usado no
loop de linha `366` e no `groupByAccount`) **DEVE** passar a incluir `'Reconciled'` — senão a entry
conciliada **some do BP/DRE/razão/balancete** (confirmado em código, CBM-001). Isto é um **class-fix**
(`idempotency-class-fix-discipline`): a implementação DEVE varrer **todo** filtro de status do módulo
accounting (`grep 'Posted'` em `features/accounting`), não só a constante — qualquer lugar que decida
"entra no relatório oficial" trata `Reconciled` como `Posted`. Regressão a provar: relatórios com dados
pré-conciliação continuam byte-idênticos (nada é `Reconciled` até o primeiro match), e uma entry conciliada
aparece no BP/DRE exatamente como aparecia `Posted`.

**[EMENDA INCR4-B]** Reversão (estorno) de uma entry `Reconciled`: `PostingService.reverseEntry` continua
exigindo `status == 'Posted'`; portanto uma entry `Reconciled` **deve ser desfeita (unmatch) antes de ser
estornada** — erro claro em vez de estorno silencioso sobre estado conciliado. Sem novo acoplamento no
motor de conciliação.

**Por quê (vencedor):** o usuário escolheu a opção completa (2026-07-03) — o status `Reconciled` do enum
deixa de ser placeholder e ganha significado real, com o flip protegido por derivação (nunca setado à mão),
reversibilidade e auditoria. **Descartado (opção A):** diferir o flip e derivar "conciliado" só em leitura —
mais lazy e sem blast-radius, mas deixa o enum `Reconciled` inerte e o estado de conciliação invisível no
lançamento. O custo de B (emenda INCR4-A + guarda INCR4-B) é controlado e coberto por teste.

### D6 — Janela + tie-break: **±3 dias, auto-match só no candidato único**

**Decisão:** auto-match determinístico. Candidato = posting na conta-banco, `entry.status=='Posted'`, **sem
match ativo**, dentro de **±3 dias** (constante `RECONCILE_WINDOW_DAYS`, `ponytail:` configurável depois),
com **igualdade exata de centavos + direção** (linha entrada `>0` ↔ `debitCents==|valor|` na conta ativo;
linha saída `<0` ↔ `creditCents==|valor|`). **Auto-match comita SOMENTE quando há exatamente 1 candidato.**
Se 0 ou >1, a linha fica `UNMATCHED` e vira **sugestão ranqueada** (por `|Δdias|` asc, depois `postingId` asc)
para revisão manual.

**Por quê (vencedor):** abster-se na ambiguidade é o que torna o auto-match **idempotente por construção** —
ele nunca escolhe entre candidatos, então re-rodar não depende de ordenação e nunca cria vínculo errado numa
corrida. Match por igualdade inteira exata (ACC-014), sem epsilon. **Descartado:** heurística que "escolhe o
mais próximo" no empate — não-determinística sob concorrência, fura ACC-013 na prática.

### D7 — Unmatch: **soft, recomputa a linha, auditado, sem efeito no ledger**

**Decisão:** desfazer é **soft** (`ReconciliationMatch.unmatchedAt/unmatchedById`, linha do vínculo
preservada — ACC-018). `BankStatementLine.status` é recomputado (volta a `UNMATCHED` se não sobra match
ativo). Como D5 seta `Reconciled`, o unmatch **recomputa a entry**: se ela deixa de ter todos os postings de
conta-banco casados, flipa `Reconciled → Posted` na **mesma tx**, auditado. `AuditEvent
reconciliation.unmatched` (+ `reconciliation.entry_unreconciled` se houve flip-back) na mesma tx (ACC-019),
payload em allowlist (matchId, statementLineId, postingId, actor, motivo opcional). Policy
`canReconcile(scope)` = mesma do match.

**Por quê:** trilha nunca é apagada (exceção ao cascade — ACC-020); unmatch não muda valor de ledger, só o
marcador de estado (reversível). **Descartado:** hard-delete do vínculo — apaga a trilha.

---

## 3. Modelo Prisma final (sujeito ao smoke-migration-gate)

```prisma
// Conciliação bancária (BE-INCR-7). First-class Prisma — liga extrato↔razão. Não muda NENHUM valor de
// ledger; só flipa JournalEntry.status Posted<->Reconciled (marcador reversível/auditado — D5).
// Tenancy = AccountingScope (userId+unitId, plain scope strings). SQLite (sem exclusion constraint).
model BankStatement {
  id                  String    @id @default(cuid())
  userId              String    // AccountingScope.ownerUserId (plain scope key)
  unitId              String    // business unit (scoped string, not a FK)
  glAccountId         String    // conta-banco (accounts.id) que este extrato representa (D4)
  glAccount           Account   @relation("AccountBankStatements", fields: [glAccountId], references: [id])
  statementRef        String?   // id/rótulo do extrato fornecido pelo banco (display)
  periodStart         DateTime
  periodEnd           DateTime
  openingBalanceCents Int?      // control-total opcional (|v| <= MAX_CENTS)
  closingBalanceCents Int?
  sha256              String    // hash do arquivo — idempotência de re-import (D1/ACC-013)
  attachmentId        String?   // DocumentAttachment do arquivo bruto (INCR-5)
  importedById        String?   // ator (AccountingScope.actorUserId); plain string
  createdAt           DateTime  @default(now())
  updatedAt           DateTime  @updatedAt
  deletedAt           DateTime?
  lines               BankStatementLine[]

  @@unique([userId, unitId, sha256])   // re-import do mesmo arquivo não duplica
  @@index([userId, unitId, glAccountId])
  @@index([deletedAt])
  @@map("bank_statements")
}

model BankStatementLine {
  id           String   @id @default(cuid())
  userId       String
  unitId       String
  statementId  String
  statement    BankStatement @relation(fields: [statementId], references: [id], onDelete: Cascade)
  lineNumber   Int      // 1-based, ordem da origem
  date         DateTime
  amountCents  Int      // SINALIZADO: >0 entrada (crédito no extrato), <0 saída. |v| <= MAX_CENTS (ACC-014)
  description  String
  externalRef  String?  // id de transação/documento do banco, quando houver
  status       String   @default("UNMATCHED") // UNMATCHED | MATCHED | IGNORED
  rawJson      String   // células originais parseadas (JSON string)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  matches      ReconciliationMatch[]

  @@unique([statementId, lineNumber])
  @@index([userId, unitId, statementId, status])
  @@index([userId, unitId, date])
  @@map("bank_statement_lines")
}

model ReconciliationMatch {
  id              String   @id @default(cuid())
  userId          String
  unitId          String
  statementLineId String
  statementLine   BankStatementLine @relation(fields: [statementLineId], references: [id], onDelete: Cascade)
  postingId       String
  posting         Posting  @relation("PostingReconciliationMatches", fields: [postingId], references: [id])
  matchType       String   // AUTO | MANUAL (D6)
  matchedById     String?  // ator; plain string
  createdAt       DateTime @default(now())
  unmatchedAt     DateTime? // soft-undo (D7/ACC-018); match ativo = unmatchedAt == null
  unmatchedById   String?

  @@unique([statementLineId, postingId]) // re-drive de auto-match não duplica vínculo (ACC-013)
  @@index([userId, unitId, postingId])
  @@index([userId, unitId, statementLineId])
  @@map("reconciliation_matches")
}
```

Back-relations a adicionar: `Account.bankStatements BankStatement[] @relation("AccountBankStatements")` e
`Posting.reconciliationMatches ReconciliationMatch[] @relation("PostingReconciliationMatches")`.

**Gate in-tx ao criar match (ACC-011, dentro de `runTransaction`, `tx` propagado):**
1. linha existe, `status != IGNORED`, pertence a um statement do mesmo scope;
2. posting existe, `accountId == statement.glAccountId`, sua `entry.status == 'Posted'`;
3. posting **não** tem match ativo (fecha double-link de linha duplicada — D3);
4. direção + centavos exatos batem (D6);
5. cria `ReconciliationMatch` + seta `line.status=MATCHED` + `AuditEvent reconciliation.matched`;
6. **recomputa a entry do posting (D5):** se todos os postings de conta-banco daquela entry têm match ativo,
   flipa `Posted → Reconciled` + `AuditEvent reconciliation.entry_reconciled` — tudo na mesma tx.

`ponytail:` split (1 posting ↔ N linhas) e conciliação de período fechado (marcador) ficam de fora do MVP;
upgrade quando houver demanda. Match/unmatch **não** têm gate de período (não mutam valor de ledger, só o
marcador de estado); o **ajuste** posta via `PostingService` que já é gated por período.

**[EMENDA 2026-07-03 — soft-delete × sha256]** O soft-delete de um `BankStatement` reescreve `sha256`
para `deleted:<id>` (colisão-livre; hash original preservado no payload do `AuditEvent
reconciliation.statement_deleted`). Sem isso, o `@@unique([userId,unitId,sha256])` — que inclui linhas
soft-deletadas — tornaria o fluxo natural *importar errado → excluir → re-importar* um beco sem saída
com P2002 cru. A idempotência de re-import (D1) é propriedade de statements **ATIVOS**.

**[NOTA — derivação D5 e novas contas-banco]** O flip é recomputado **somente** em match/unmatch. Importar
um statement para uma **segunda** conta-banco não recomputa entries já `Reconciled` (podem ficar com perna
nova inconciliável até unmatch+rematch). Comportamento aceito no MVP; recompute-on-import é upgrade se
o caso aparecer na prática.

---

## 4. Fluxo (MVP)

1. **Importar extrato** → `parseTable` → cria `BankStatement` (dedup sha256) + `BankStatementLine[]` staged.
2. **Auto-match** (D6): por linha `UNMATCHED`, candidato único → `AUTO` match; ambíguo/zero → fica pendente + sugestões ranqueadas.
3. **Revisão manual:** aceitar sugestão, casar (N postings↔1 linha), marcar `IGNORED` (tarifa a lançar), **unmatch** (soft, D7).
4. **Postar ajuste** (falta lançamento): `PostingService.postEntry` — fluxo existente, gated por período, fora do motor de conciliação.
5. **Relatório de pendências** as-of: linhas `UNMATCHED` + postings da conta-banco sem match ativo. Exportável (padrão INCR-6).

---

## 5. Definition of Done / gates de teste (domínio)

- `tsc` limpo (2 pacotes) · Jest verde sem regredir · `docs:generate` · skill-audit `wiring` · **smoke-migration-gate** (dados vivos) · review por agente independente.
- **Testes obrigatórios:** auto-match idempotente (re-run = 0 novos vínculos); match por centavo+direção exatos; ambiguidade (>1 candidato) → não casa; **TOCTOU** (posting estornado/entry não-Posted entre sugestão e commit → rejeita in-tx); **double-link** (linha duplicada não re-concilia posting já casado); unmatch soft preserva trilha + recomputa linha; **tenancy** cross-unit → `NotFoundError`; **re-import** mesmo arquivo (sha256) não duplica; auditoria `reconciliation.*` grava na mesma tx.
- **Testes do flip D5 (opção B):** entry vira `Reconciled` só quando **todos** os postings de conta-banco casam (derivado, nunca à mão); unmatch flipa `Reconciled → Posted`; flip e flip-back auditados na mesma tx.
- **Emenda INCR4-A (gate):** entry `Reconciled` **aparece** no BP/DRE/razão/balancete igual a `Posted`; relatório com dados pré-conciliação é **byte-idêntico** (regressão); varredura de `grep 'Posted'` no módulo cobre todo filtro de status, não só a constante.
- **Emenda INCR4-B:** estornar entry `Reconciled` → erro "unmatch primeiro" (não estorna sobre estado conciliado).
- **Invariante de fechamento:** nenhuma escrita em `Posting`/débito/crédito pelo motor de conciliação (só vínculos + `JournalEntry.status`) — prova de que **nenhum valor** de ledger muda (D5).

---

## 6. Rejeitados (resumo "por quê / vencedor")

| Alternativa | Vencedor | Motivo |
|---|---|---|
| `ImportKind IMPORT_BANK_STATEMENT` reusando DataExchange | Models próprios + `parseTable` | Motor de import posta no ledger; extrato não posta (D1) |
| OFX/CNAB no MVP | CSV/XLSX only | Parser bancário é subprojeto (D2) |
| Vínculo linha↔journalEntry | linha↔posting | Entry tem múltiplas pernas; posting é o grão certo (D3) |
| Entidade "BankAccount" nova | `Account` existente como âncora | Tenancy/unicidade já provadas (D4) |
| Diferir `JournalEntry.status=Reconciled` (opção A) | **Setar no MVP** — flip derivado/reversível/auditado (opção B, escolha do usuário) | Dá significado real ao enum `Reconciled`; custo (emenda INCR4-A/B) controlado e testado (D5) |
| Auto-match "escolhe o mais próximo" no empate | Só candidato único; abstém no empate | Determinismo/idempotência sob concorrência (D6) |
| Hard-delete do vínculo | Unmatch soft | Preserva trilha (D7/ACC-020) |
