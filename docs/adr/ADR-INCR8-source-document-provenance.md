# ADR-INCR8 — Proveniência Formal (SourceDocument + JournalEntrySource)

- **Status:** Accepted — altitude **A1 (seam fino)** ratificada pelo usuário (web3br1) em **2026-07-03** via AskUserQuestion. Demais decisões (D2–D7) tomadas pelo agente com base no parecer de domínio + código (CBM-001). Implementação **não iniciada**.
- **Date:** 2026-07-03
- **Decision class:** PRISMA_FIRST_CLASS (camada de proveniência/rastreio; nunca DynamicTable — Contrato §2.1). **Não** é módulo de invariante monetário — é descritivo, ao lado do ledger.
- **Depends on:** INCR-D (`JournalEntry`/`Posting`), INCR-3 (numeração), INCR-5 (anexos), INCR-6 (import), INCR-7 (conciliação) — todos em `main` (`06462ac`).
- **Escopo (fonte):** `docs/accounting/BE-INCR8-source-document-provenance-scope-brief.md` · **Roadmap:** `docs/accounting/ACCOUNTING-MASTER-MAP.md` §5
- **Supersedes:** none · **Related:** ADR-INCR7 (BankStatement como documento-origem ilha) · T7 (idempotência travada — **preservada, não reaberta**)

> **Nota de processo.** ADR escrito **antes** de qualquer código (ordem ideal: ADR → impl → review).
> A decisão-gate (altitude) foi **delegada ao usuário** e respondida **A1 — seam fino** em 2026-07-03.
> As demais foram tomadas pelo agente com base no parecer `luminaris-accounting-architect`, no master
> map e na leitura do código (CBM-001). Divergências vs. o modelo *proposto* no brief estão marcadas
> **[REFINA O BRIEF]** com o porquê.

---

## 1. Contexto

**Não existe proveniência formal hoje.** A proveniência do Luminaris está fragmentada em **três
mecanismos desconexos** (confirmado por código — CBM-001):

1. **`JournalEntry.sourceType` (default `"manual"`) + `sourceId?`** (`schema.prisma:417-418`), com
   **`@@unique([userId,unitId,sourceType,sourceId])`** (`:433`). Estas duas colunas existem **para
   idempotência** (decisão travada **T7**), não como descrição de documento.
2. **`DocumentAttachment`** (INCR-5) — arquivo de evidência anexado a **uma** entry (FK a
   `journal_entries`); é anexo, não registro de origem.
3. **`BankStatement`/`BankStatementLine`** (INCR-7) — um extrato bancário (que **é** um documento de
   origem), ligado a `Posting` via `ReconciliationMatch`, **fora** do eixo `sourceType`/`sourceId`.

**Taxonomia viva de `sourceType`** (grep, confirmada em código): `manual` · `reversal` ·
`crm.opportunity.won` · `salon.sale.finalized` · `salon.sale.returned` · `salon.sale.settled` ·
`salon.package.sold` · `IMPORT_JOURNAL_ENTRIES`.

**Correções de premissa (CBM-001), registradas para não se propagarem:**
- **Não** existe `sourceType='BANK_TRANSACTION'`. A conciliação não posta por `sourceType`; o extrato
  é entidade própria ligada por `ReconciliationMatch`.
- **`externalReference` NÃO é campo de `JournalEntry`.** Só existe como coluna CSV no import, onde é
  **dobrada dentro de `sourceId`** (`DataExchangeImportService.journalSourceId`, `:314/:340-344`):
  quando o usuário informa a referência, ela **vira** a chave de idempotência; quando não, um hash
  `di:<sha>`. Isto **conflaciona** identidade-de-idempotência com referência-humana-do-documento.

**Déficit concreto que motiva o seam (o único, e é real):** a conflação acima. A referência do
documento (nota fiscal nº X, boleto nº Y) é descritiva, pode repetir entre origens e é o que um
drill-down de auditoria/ECD-ECF vai querer ler; a chave de idempotência tem de ser estável e
colisão-controlada. Hoje são a mesma string. Um `SourceDocument.externalRef` separado resolve isto.

**Objetivo (MVP, altitude A1):** dar ao ledger um **registro de origem first-class e uniforme**
(`SourceDocument`) e um vínculo entry↔documento (`JournalEntrySource`), populados **só em novos
writes**, **sem backfill**, com a **idempotência T7 intocada**. Estabelece o alvo de drill-down que
ECD/ECF (diferido) consumirá, e desconflaciona referência×idempotência no import. **Nenhum valor de
ledger muda** — a camada é descritiva.

**Tensão YAGNI registrada (honestidade de escopo):** o consumidor real (ECD/ECF) está **diferido e
não-escopado**. A altitude A1 foi escolhida justamente por ser o degrau de custo/risco mínimo que
avança a fundação sem fixar shape especulativo: campos mínimos, N:M estrutural reservado mas não
usado, zero toque na idempotência viva. A2 (backfill/retrofit) foi **rejeitada** aqui (§6) por tocar
T7 sobre dados reais sem um consumidor que justifique o risco.

**Invariantes herdados (do parecer, aplicáveis):** ACC-010 (proveniência ≠ auditoria ≠ log — três
tabelas), ACC-011/012 (gate + tx propagada), ACC-013 (idempotência por identidade do evento, nunca
`userId`), ACC-019/020 (auditoria in-tx, exceção ao cascade), ACC-021 (relatório as-of / só oficial).

---

## 2. As decisões

### D1 — Altitude: **A1 — seam fino** (ratificada pelo usuário)

**Decisão:** `SourceDocument` + `JournalEntrySource` first-class Prisma, populados **somente em novos
lançamentos**, **sem backfill** das origens existentes, com a idempotência `JournalEntry.@@unique(
[userId,unitId,sourceType,sourceId])` (**T7**) **inalterada**. Resolve o déficit do import (§1) e
estabelece o drill-down entry→documento→arquivo.

**Por quê (vencedor):** custo/risco mínimo que avança a fundação rumo a ECD/ECF sem fixar shape
especulativo nem tocar no que já está provado. **Descartado A0** (diferir): defensável (YAGNI-estrito,
consumidor ausente), mas o usuário optou por avançar o roadmap; o déficit do import é fechado no
caminho. **Descartado A2** (backfill + retrofit + depreciar colunas string): migra a coluna que
carrega a idempotência viva → alto risco sobre dados reais sem consumidor que o justifique.

### D2 — Idempotência: **ao lado, T7 preservada** (SourceDocument NÃO deduplica o ledger)

**Decisão:** a idempotência de lançamento continua **exclusivamente** em
`JournalEntry.@@unique([userId,unitId,sourceType,sourceId])`. `SourceDocument` **não** tem unicidade
que substitua ou espelhe essa chave. Como o `postEntry` já **curto-circuita no idempotent-hit antes de
abrir a tx** (`PostingService.ts:179-189`) e fecha a corrida via P2002 (`:263-277`), um re-post do
mesmo `(sourceType,sourceId)` **nunca chega** à criação de `SourceDocument` — logo, uma origem por
entry nova, sem duplicar, sem precisar de `@@unique` próprio em `SourceDocument`.

**Por quê:** T7 é decisão travada; mover idempotência para `SourceDocument` a reabriria. Dedup de
`SourceDocument` por `externalRef` (dois lançamentos citando a "mesma" nota) é feature que ECD/ECF
pode querer, mas é **especulativa agora** → não modelada (YAGNI). **Descartado:** `@@unique` em
`SourceDocument` ligando idempotência à referência humana — exatamente a conflação que este ADR desfaz.

### D3 — Cardinalidade: **N:M estrutural, MVP escreve 1 entry ← 1 SourceDocument**  **[REFINA O BRIEF]**

**Decisão:** o vínculo é a tabela `JournalEntrySource` (entry ↔ documento), **N:M estrutural**, com
`@@unique([journalEntryId, sourceDocumentId])`. O **MVP escreve 1 entry ← 1 documento**; um documento
→ N entries (splits) e N documentos → 1 entry (settlement citando nota+pagamento) ficam **estruturados
mas não exercidos** no MVP.

**Por quê:** espelha o padrão provado da conciliação (ADR-INCR7 D3: "N:M estrutural, MVP-constrangido")
— a forma comporta o futuro sem custo, o código não precisa do futuro agora. **Descartado:** FK direta
`SourceDocument.journalEntryId` (1:1 rígido) — fecharia splits/settlement que ECD/ECF eventualmente
pede, forçando migração depois.

### D4 — `BankStatement`/`BankStatementLine` **NÃO** viram `SourceDocument`

**Decisão:** o extrato bancário (INCR-7) **permanece ilha própria**, ligado por `ReconciliationMatch`.
`SourceDocument` cobre **apenas** as origens `sourceType`-driven (CRM, salão, import) que passam pelo
`postEntry`.

**Por quê:** unificar reabriria uma ilha recém-fechada e provada (INCR-7), com blast radius, sem
ganho no MVP — o extrato já tem drill-down próprio (linha↔posting). **Descartado:** subtipar
`BankStatementLine` como `SourceDocument` — refactor de INCR-7 sem consumidor que o exija.

### D5 — Quem popula: **`postEntry`, na mesma tx, via descritor de origem EXPLÍCITO**  **[REFINA O BRIEF]**

**Decisão:** o `PostEntryInput` ganha um campo **opcional** `sourceDocument?` (descritor:
`{ externalRef?, documentDate?, description?, attachmentId?, rawJson? }`). Quando presente, o
`postEntry` cria `SourceDocument` + `JournalEntrySource` **dentro do `runTransaction` existente**
(`PostingService.ts:204`), depois do `journalEntryRepo.create`, junto com o `AuditService.append` já
ali — atômico, `tx` propagado (T6). Quando **ausente**, nenhuma origem é criada.

**Consequência deliberada:** lançamentos **`manual`** (`sourceId=null`) e **`reversal`**
(`sourceType='reversal'`, `sourceId=originalId`) **não** passam descritor → **não** geram
`SourceDocument`. Estorno é operação **interna** (entry→entry, já capturada por `reversedById`), não
documento externo; manual sem referência não tem documento a registrar. As bridges (salão/CRM) e o
import passam o descritor com a referência real da origem.

**Por quê:** o descritor explícito evita que o `postEntry` **adivinhe** origem a partir de uma
allowlist hardcoded de `sourceType` (smell de manutenção) e mantém o seam num **único ponto** por onde
toda origem externa já passa. Nascer na mesma tx garante ACC-011/012 (origem e lançamento átomos).
**Descartado:** serviço/bridge separado pós-commit que cria a origem depois — abre janela de
lançamento-sem-origem e duplica o locus. **Descartado:** `postEntry` inferir `SourceDocument` de todo
`sourceId` não-nulo — criaria origem espúria para `reversal`.

### D6 — `externalReference`: vive **só** em `SourceDocument.externalRef`; import desdobra

**Decisão:** a referência humana do documento vive em `SourceDocument.externalRef`. **Não** se adiciona
campo `externalReference` a `JournalEntry` (isso era o caminho A0). O `DataExchangeImportService` passa
a **desdobrar** `externalReference`→`sourceDocument.externalRef`, **mantendo** `sourceId` como chave de
dedup (`di:<sha>` quando não há referência — `journalSourceId` inalterado nessa parte).

**Por quê:** desfaz a conflação do §1 no ponto exato onde ela nasce, sem novo campo redundante na
entry. **Regressão obrigatória:** a idempotência do import continua **byte-idêntica** — `sourceId`
não muda; só o `externalReference` deixa de ser *usado como* `sourceId` e passa a *também* alimentar
`externalRef`. **Descartado:** campo duplo (entry + documento) — redundância sem consumidor.

### D7 — Tenancy/cascade: **no-cascade — a origem sobrevive ao delete do usuário**

**Decisão:** `SourceDocument.userId`/`unitId` e `JournalEntrySource.userId`/`unitId` são **plain scope
strings sem FK a `User`** (mesma convenção de `AuditEvent`/`DocumentAttachment`/`AccountingScope`) →
apagar um usuário **não** apaga a origem (**ACC-020**). `JournalEntrySource.journalEntryId` é FK a
`journal_entries` (a entry é imutável/soft-delete, nunca hard-deletada — o cascade é inócuo).

**Por quê:** proveniência é evidência; a trilha de origem é exceção ao `onDelete:Cascade` como a
auditoria (`audit-log-no-fk-cascade`). Note que `JournalEntry.userId` **tem** cascade hoje
(`schema.prisma:412`) — a proveniência conscientemente **não** segue esse cascade. **Descartado:** FK
`User` com cascade — apagaria a origem junto com o usuário.

---

## 3. Modelo Prisma final (sujeito ao smoke-migration-gate)

```prisma
// Proveniência formal (BE-INCR-8 / ADR-INCR8). First-class Prisma — camada DESCRITIVA/de rastreio ao
// lado do ledger. NÃO muda nenhum valor de ledger, NÃO substitui a idempotência (T7 vive em
// JournalEntry.@@unique([userId,unitId,sourceType,sourceId])). Tenancy = AccountingScope
// (userId+unitId, plain scope strings, SEM FK User → no-cascade, ACC-020). SQLite.

// O documento/evento de origem que originou lançamento(s). Uniforme entre origens (CRM, salão,
// import). Campos mínimos deliberados (A1 seam fino — mitiga shape especulativo pré-ECD/ECF).
model SourceDocument {
  id           String   @id @default(cuid())
  userId       String   // AccountingScope.ownerUserId (plain scope key; SEM FK User — D7)
  unitId       String   // business unit (scoped string, not a FK)
  sourceType   String   // taxonomia viva: crm.opportunity.won | salon.sale.* | IMPORT_JOURNAL_ENTRIES | ...
  externalRef  String?  // referência HUMANA do documento (NF nº X, boleto nº Y) — separada do sourceId/idempotência (D6)
  documentDate DateTime? // data do documento de origem, quando distinta da data de lançamento
  description  String?  // rótulo curto da origem (display/drill-down)
  attachmentId String?  // DocumentAttachment do arquivo bruto, quando houver (INCR-5); plain string
  rawJson      String?  // snapshot opcional da origem (JSON string)
  createdById  String?  // ator (AccountingScope.actorUserId); plain string
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  deletedAt    DateTime? // soft-delete p/ correção futura; NENHUM path de delete é wired no MVP
  sources      JournalEntrySource[]

  // SEM @@unique de idempotência (D2): a dedup do ledger é do JournalEntry; postEntry curto-circuita
  // no idempotent-hit antes de criar a origem, então re-post não duplica SourceDocument.
  @@index([userId, unitId, sourceType])
  @@index([userId, unitId, externalRef])
  @@index([deletedAt])
  @@map("source_documents")
}

// Vínculo entry <-> documento de origem. N:M estrutural (D3); MVP escreve 1 entry <- 1 documento.
model JournalEntrySource {
  id               String   @id @default(cuid())
  userId           String   // plain scope key (denormalizado p/ query scoped; SEM FK User — D7)
  unitId           String
  journalEntryId   String
  journalEntry     JournalEntry   @relation("JournalEntrySources", fields: [journalEntryId], references: [id], onDelete: Cascade)
  sourceDocumentId String
  sourceDocument   SourceDocument @relation(fields: [sourceDocumentId], references: [id])
  createdAt        DateTime @default(now())

  @@unique([journalEntryId, sourceDocumentId]) // re-drive não duplica o vínculo
  @@index([userId, unitId, sourceDocumentId])
  @@index([userId, unitId, journalEntryId])
  @@map("journal_entry_sources")
}
```

Back-relation a adicionar em `JournalEntry`: `sources JournalEntrySource[] @relation("JournalEntrySources")`.

**Extensão do `PostEntryInput` (DTO):** campo opcional
`sourceDocument?: { externalRef?: string; documentDate?: string; description?: string; attachmentId?: string; rawJson?: string }`
— Zod `.strict()`. Ausente ⇒ sem origem (manual/reversal). Presente ⇒ origem criada na tx (D5).

**Seam no `postEntry` (dentro do `runTransaction` existente, `PostingService.ts:204`, `tx` propagado):**
1. cria a entry `Posted` (como hoje);
2. **se `input.sourceDocument` presente:** cria `SourceDocument` (scope + `sourceType` = o mesmo da
   entry + campos do descritor) e `JournalEntrySource` ligando `entry.id`↔`sourceDocument.id`;
3. `AuditService.append` (já ali) ganha, quando houve origem, o evento `entry.source_recorded`
   (mesma tx — ACC-019), payload em allowlist (`sourceDocumentId`, `externalRef`, `sourceType`).

`ponytail:` splits/settlement (N:M exercido), dedup de `SourceDocument` por `externalRef`, unificação
do extrato bancário e backfill das origens existentes ficam **fora** do MVP — upgrade quando ECD/ECF
(o consumidor) definir o shape exigido.

---

## 4. Fluxo (MVP)

1. **Bridge/import posta** → `postEntry` com `sourceDocument` descritor → entry + `SourceDocument` +
   `JournalEntrySource` na mesma tx.
2. **Import DataExchange** → `externalReference`→`sourceDocument.externalRef`; `sourceId` (dedup)
   inalterado (D6).
3. **Manual / reversal** → sem descritor → sem origem (D5).
4. **Drill-down (leitura):** `JournalEntry.sources[]` → `SourceDocument` → `attachmentId` → arquivo
   bruto (INCR-5). Base do que ECD/ECF consumirá.
5. **Re-post idempotente** → curto-circuita antes da tx → nenhuma origem nova (D2).

---

## 5. Definition of Done / gates de teste (domínio)

- `tsc` limpo (2 pacotes) · Jest verde **sem regredir** · `docs:generate` (se rota) · skill-audit
  `wiring` · **smoke-migration-gate** sobre backup do `dev.db` real (`accounting-incr1-db-risk`) ·
  review por agente independente (worktree isolado).
- **Testes obrigatórios:**
  - **Atomicidade:** entry + `SourceDocument` + `JournalEntrySource` nascem juntos; falha em qualquer
    um faz rollback de todos (nenhuma entry com origem órfã, nenhuma origem sem entry).
  - **Idempotência T7 — regressão byte-idêntica:** re-post do mesmo `(sourceType,sourceId)` retorna a
    entry existente e **não** cria `SourceDocument` novo; a `@@unique` do `JournalEntry` é inalterada.
  - **Desconflação (D6):** dois documentos com a **mesma** `externalRef` em origens/`sourceId`
    diferentes **não** colidem; `externalRef` não participa de nenhuma chave de dedup.
  - **Manual/reversal sem origem (D5):** `postEntry` sem descritor e `reverseEntry` **não** criam
    `SourceDocument`.
  - **No-cascade (D7):** apagar o `User` **não** apaga `SourceDocument`/`JournalEntrySource`.
  - **Tenancy:** leitura cross-unit → `NotFoundError`.
  - **Drill-down:** dado um `JournalEntry`, `sources[]` resolve o documento e o anexo.
  - **Auditoria:** `entry.source_recorded` grava na **mesma tx** quando há origem; ausente quando não há.
- **Invariante de fechamento:** **nenhuma** escrita em `Posting`/débito/crédito/`JournalEntry.status`
  pela camada de proveniência — prova de que nenhum valor de ledger muda.

---

## 6. Rejeitados (resumo "por quê / vencedor")

| Alternativa | Vencedor | Motivo |
|---|---|---|
| **A0** — diferir tudo até ECD/ECF | **A1 seam fino** (escolha do usuário) | Avança a fundação com custo/risco mínimo e fecha o déficit do import; A0 é defensável mas não avança o roadmap (D1) |
| **A2** — formalizar + backfill + depreciar colunas string | **A1 seam fino** | A2 migra a coluna que carrega a idempotência viva (T7) sobre dados reais, sem consumidor que justifique o risco (D1) |
| Mover idempotência para `SourceDocument` | Idempotência fica no `JournalEntry` (T7) | Reabriria decisão travada; `SourceDocument` é descritivo, não chave de dedup (D2) |
| FK 1:1 `SourceDocument.journalEntryId` | Tabela de vínculo `JournalEntrySource` N:M | Fecharia splits/settlement que ECD/ECF pede; N:M estrutural custa nada agora (D3) |
| Unificar `BankStatement` sob `SourceDocument` | Extrato fica ilha própria (INCR-7) | Refactor com blast radius, sem ganho no MVP (D4) |
| `postEntry` inferir origem de todo `sourceId` não-nulo | Descritor `sourceDocument` explícito | `reversal` tem `sourceId` e é interno — inferência criaria origem espúria (D5) |
| Campo `externalReference` também em `JournalEntry` | Referência só em `SourceDocument.externalRef` | Redundância sem consumidor; A0-shaped, não A1 (D6) |
| FK `User` com cascade | Plain scope strings, no-cascade | Proveniência é evidência, sobrevive ao delete do usuário (D7/ACC-020) |
