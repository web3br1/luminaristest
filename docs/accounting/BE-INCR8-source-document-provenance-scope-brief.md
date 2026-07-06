# BE-INCR-8 — Proveniência Formal (SourceDocument + JournalEntrySource) — **BRIEF DE ESCOPO (PRE-ADR)**

> 🟠 **STATUS: DRAFT DE ESCOPO — PRE-ADR. NÃO IMPLEMENTÁVEL.**
> Detalha o escopo do próximo incremento contábil **candidato** (proveniência formal) para
> ratificação por ADR + sinal humano. **Não é plano ratificado.** As decisões marcadas
> `DECISÃO ARQUITETURAL` exigem **ADR em disco + sinal humano** antes de qualquer código
> (regra do `luminaris-accounting-architect` / `_ARCHITECTURE-CONTRACT.md`). Nenhuma skill de
> geração deve ser roteada contra este doc até o ADR existir.
>
> **Precedência:** onde este brief divergir de um futuro `ADR-INCR8-*`, o **ADR vence**.
>
> HEAD de referência: `06462ac` (BE-INCR-7 conciliação 100% fechado; deploy-gate PASS #39).
> Verificado por código 2026-07-03 (CBM-001): não há `SourceDocument`/`JournalEntrySource` em
> nenhuma branch (`git log --all --grep` vazio); o incremento **não** está em `main`.

---

## 0. Por que este é o "próximo passo documentado" — e o alerta de altitude

O master map (`ACCOUNTING-MASTER-MAP.md` §5) marca **SourceDocument + JournalEntrySource** como
*"⚫ Diferido — extensão, não greenfield… candidato mais defensável pós-INCR-7"*. A racional
registrada: a proveniência mínima já existe (`sourceType`/`sourceId`, D1) e este seria *"o último
degrau de fundação antes de ECD/ECF terem drill-down até o documento de origem"*.

⚠️ **Tensão YAGNI que este brief NÃO esconde (rung-1 do ponytail — "isto precisa existir agora?"):**
o **único consumidor real** de uma proveniência formal — **ECD/ECF** (SPED contábil/fiscal) — está
ele próprio **DIFERIDO e não-escopado** (master map §5, Núcleo 5 ~5%). Hoje **nada** lê "documento
de origem": os relatórios (INCR-4) já fazem drill-down até o `JournalEntry`; não há tela, export,
nem pacote de compliance que consuma um `SourceDocument`. Construir o modelo de proveniência
**antes** de o seu consumidor ter forma definida é o modo clássico de falha do YAGNI: fixa-se o
shape errado. **Por isso a decisão nº 1 do §8 é a de altitude (defer vs. seam fino vs. retrofit
completo) — e ela é genuinamente do usuário/roadmap, não default do agente.**

Contrapeso honesto: existe **um** déficit concreto e confirmado em código (§3), pequeno, que
justifica *um* seam fino mesmo sem ECD/ECF pronto — a conflação idempotência×referência.

## 1. ⚠️ Desambiguação obrigatória — proveniência ≠ auditoria ≠ log, e o estado FRAGMENTADO de hoje

**[ACC-010]** exige três mecanismos **separados**, três tabelas: **proveniência** (qual
documento/evento originou o lançamento), **trilha de auditoria** (quem fez o quê — `AuditEvent`
hash-chain, INCR-2) e **log técnico**. `AuditEvent` **não** fecha proveniência sozinho.

Hoje a proveniência do Luminaris está espalhada em **três mecanismos desconexos** (confirmado por
código — CBM-001):

| Mecanismo | O que carrega | Onde | Limite |
|---|---|---|---|
| **`JournalEntry.sourceType` + `sourceId`** (2 colunas string) | tipo-de-origem + id do registro de origem | `schema.prisma:417-418` · `@@unique([userId,unitId,sourceType,sourceId])` :433 | Existe **para idempotência** (T7), não para descrição. `sourceId` é overloaded (ver §3). |
| **`DocumentAttachment`** | arquivo de evidência anexado a UMA entry | `schema.prisma:462` (INCR-5) · FK a `journal_entries` | É **anexo**, não registro de origem; 1 target = 1 JournalEntry. |
| **`BankStatement` / `BankStatementLine`** | um extrato bancário importado (que **é** um documento-origem) | `schema.prisma:573-620` (INCR-7) · ligado a `Posting` via `ReconciliationMatch` | **Fora do eixo `sourceType`/`sourceId`** — ilha própria; não há `sourceType='BANK_TRANSACTION'`. |

**Correção de premissa (CBM-001):** o prompt e a tabela de tensões da persona afirmam que a
conciliação "cria um `sourceType` novo (`BANK_TRANSACTION`)" e que "D1 = `externalReference` em
`JournalEntry`". **Ambas imprecisas por código:** (a) **não** existe `sourceType='BANK_TRANSACTION'`
— o extrato é entidade própria ligada por `ReconciliationMatch`, não por `sourceType`; (b)
**`externalReference` NÃO é campo de `JournalEntry`** — só existe como coluna CSV no pipeline de
import, onde é **dobrada dentro de `sourceId`** (`DataExchangeImportService.ts:314,340-344`). A
proveniência mínima real é **`sourceType`+`sourceId`**, não `externalReference`.

## 2. Objetivo & não-objetivos

**Objetivo (candidato, sujeito à altitude do §8.1):** dar ao ledger um **registro de origem
first-class e uniforme** — uma tabela `SourceDocument` (o documento/evento que originou lançamentos)
e um vínculo `JournalEntrySource` (entry ↔ documento) — de modo que **todo** lançamento, qualquer
que seja a origem (`manual`, CRM, salão, import, futuramente banco/NF-e), possa fazer drill-down até
o seu documento de origem por **um** caminho, e a **referência humana do documento** deixe de ser
conflada com a **chave de idempotência**. Isso prepara o drill-down que ECD/ECF exigirá — **sem**
mudar nenhum valor de ledger e **sem** tocar na idempotência já provada (T7).

**Não-objetivos (fora deste incremento — cada um é seu próprio ADR):**
- **ECD/ECF** (geração dos leiautes SPED, mapeamento referencial, blocos I/J/K) — o consumidor;
  depende deste degrau mas é ADR próprio (master map §5).
- **OFX/CNAB/NF-e** (ingestão fiscal/bancária rica) — cada um seu ADR.
- **Backfill/migração das origens existentes** para `SourceDocument` **se** a altitude escolhida for
  o seam fino (§8.1 A1). Só entra no A2.
- **Unificar `BankStatement`/`BankStatementLine` sob `SourceDocument`** — decisão §8.4; default é
  deixar o extrato como ilha própria no MVP.
- **Reescrever a chave de idempotência** `(sourceType,sourceId)` — T7 é decisão travada; permanece.
- Multi-moeda, torre de aprovação, dimensões, subrazões.

## 3. PARECER DE DOMÍNIO CONTÁBIL — lente `luminaris-accounting-architect`

**Bloco do roadmap:** 3 integração / 7 compliance (fundação para) — pós-núcleo. Depende de
`JournalEntry`/`Posting` (INCR-D), numeração (INCR-3), anexos (INCR-5), import (INCR-6), conciliação
(INCR-7) — todos mergeados.

**Já existe no projeto?** **Como feature de proveniência formal, não.** Existe a proveniência
**mínima** (`sourceType`+`sourceId`) e os blocos de reuso (§4). Não há `SourceDocument`/
`JournalEntrySource` em nenhuma branch (grep). O que existe **hoje** e precisa ser reconciliado:
- **`JournalEntry.sourceType`** (default `"manual"`) e **`sourceId?`** — as duas colunas de origem.
- **`@@unique([userId,unitId,sourceType,sourceId])`** — a idempotência real (T7). **Não é
  proveniência descritiva; é chave de dedup.**
- **Taxonomia viva de `sourceType`** (grep, confirmada em código): `manual` ·
  `crm.opportunity.won` · `salon.sale.finalized` · `salon.sale.returned` · `salon.sale.settled` ·
  `salon.package.sold` · `IMPORT_JOURNAL_ENTRIES`.

**Déficit concreto que motiva o seam (o único, e é real):** no import, o **`externalReference`
estável do usuário é usado COMO `sourceId`** (`DataExchangeImportService.journalSourceId`,
`:314/:340`). Isso **conflaciona dois conceitos distintos**: a *identidade de idempotência* (que
tem de ser estável e colisão-controlada) e a *referência humana do documento* (nota fiscal nº X,
boleto nº Y — que é descritiva e pode repetir entre origens). Um `SourceDocument` separa os dois:
`sourceId`/`@@unique` continua sendo a chave de dedup; `SourceDocument.externalRef` passa a ser a
referência do documento, first-class e pesquisável.

**Colisão com decisão commitada?** **NÃO** — desde que respeite as travadas (§ master map §1):
- **T1 SQLite** — nada de constraint de exclusão PG; unicidade via `@@unique` + gate in-tx.
- **T2 `AccountingScope`** (`userId`+`unitId`) — sem torre multiempresa; `SourceDocument` é scoped
  por `userId`+`unitId` (plain scope strings, mesma convenção de `AuditEvent`/`DocumentAttachment`).
- **T3 Prisma first-class** — Model + Repository + Policy + Service próprios; **nunca** DynamicTable.
- **T5 estorno-nunca-delete / T8 audit sem cascade** — `SourceDocument`/`JournalEntrySource` são
  append-only na prática; soft-delete no máximo, nunca hard-delete que apaga a origem.
- **⚠️ T7 idempotência** — **inegociável: o seam NÃO pode reescrever nem substituir
  `(sourceType,sourceId)`.** `SourceDocument` fica **ao lado** da idempotência, não no lugar dela.
  Qualquer decisão que mova a idempotência para `SourceDocument.id` é `DECISÃO ARQUITETURAL` e
  reabre T7.

### Invariantes que o plano DEVE garantir (os aplicáveis)

- **[ACC-010] separação de mecanismos:** `SourceDocument` (origem) ≠ `AuditEvent` (quem fez) ≠ log.
  O plano cria a **terceira** tabela; **não** funde proveniência em `AuditEvent` nem vice-versa.
- **[ACC-013] idempotência por identidade do evento, não por `userId`:** a chave de dedup permanece
  `(sourceType,sourceId)` no `JournalEntry` (T7). Se `SourceDocument` ganhar unicidade própria, ela
  liga em **`(sourceType/sourceSystem, externalId)`**, **jamais** em `userId`. Guarda pré-tx via repo
  injetado (`orchestration-service-tx-repo-smell`) — nunca `new TransactionalRepository` no service.
- **[ACC-011/012] gate + tx propagada:** criar `SourceDocument` + `JournalEntrySource` **na mesma
  `runTransaction`** do `postEntry` (ou como extensão atômica dele), com `tx` propagado a todo write
  (`tx-nao-propagado-ao-repo`). Origem e lançamento nascem juntos ou não nascem.
- **[ACC-019/020] auditoria in-tx, sem cascade:** se a criação de origem virar evento auditável,
  grava `AuditEvent` na mesma tx; `SourceDocument`/`JournalEntrySource` são **exceção ao
  `onDelete:Cascade`** de `User` (apagar usuário não apaga a origem — `audit-log-no-fk-cascade`).
  **Nota:** hoje `JournalEntry.userId` **tem** `onDelete: Cascade` (`schema.prisma:412`) — a decisão
  de proveniência precisa escolher conscientemente se `SourceDocument` segue a entry (cascade) ou a
  trilha (no-cascade); o parecer recomenda **no-cascade** (origem é evidência, sobrevive ao usuário).
- **[ACC-014] centavos inteiros / MAX_CENTS:** se `SourceDocument` guardar um valor de controle
  (valor do documento), é `*Cents Int` com teto `MAX_CENTS` — igualdade exata, sem float
  (`money.ts`). Provável **não** precisar de valor no MVP (descritivo), mas se entrar, esta regra.
- **[ACC-021] relatório as-of / só oficial:** qualquer leitura de "documentos sem lançamento" ou
  "lançamentos sem documento" é as-of/por-período e respeita o filtro de status oficial
  (`LEDGER_STATUSES`, já inclui `Posted|Reconciled|Reversed` pós-INCR-7).

### Tradução aspiracional → realidade do projeto

- Doc/persona diz *"D1 = `externalReference` em `JournalEntry`"* → **falso por código**: `JournalEntry`
  tem `sourceType`+`sourceId`; `externalReference` só existe no CSV de import, dobrado em `sourceId`.
- Doc diz *"exclusion constraint / unicidade de proveniência"* → **SQLite:** `@@unique` +
  gate transacional; nunca recurso PG.
- Grafo aspiracional trata `SourceDocument` como novidade greenfield → **é extensão**: reusa a
  identidade `(sourceType,sourceId)` já existente como âncora; não recria idempotência.

### Recomendação de roteamento (o **orquestrador** decide as skills — [ACC-002])

- **Prisma first-class:** `prisma-model` (`SourceDocument` + `JournalEntrySource` + back-relations),
  `repository` + `IRepository`, `policy` (`canRecordSource`/reusa `canManageAccounting`), `service`
  (ou extensão de `PostingService` para popular a origem na mesma tx — decisão §8.5), `dto` Zod
  `.strict()`, `controller` + rota 3-toques (só se houver leitura/escrita HTTP própria — pode ser
  interno no MVP), `factory`, `test-suite`, `api-contract-sync`, `luminaris-reviewer`.
- **Gates de teste de domínio obrigatórios:** origem+entry criadas atômicas (rollback junto);
  idempotência **inalterada** (re-post do mesmo `(sourceType,sourceId)` continua dedup — regressão
  T7 byte-idêntica); `externalRef` separado de `sourceId` (dois documentos com mesma `externalRef`
  em origens diferentes **não** colidem); no-cascade (apagar usuário preserva `SourceDocument`);
  tenancy cross-unit → `NotFoundError`.

### Riscos de domínio

- **Backfill (só se A2):** migrar `sourceType`/`sourceId` de N lançamentos vivos para
  `SourceDocument` toca **a coluna que carrega a idempotência** — alto risco sobre T7; exige
  smoke-migration-gate sobre `dev.db` real + prova de que nenhuma chave de dedup muda.
- **Shape especulativo:** sem ECD/ECF escopado, o schema de `SourceDocument` pode nascer errado
  (campos que o leiaute SPED exigirá depois). Mitigação = seam fino, campos mínimos, N:M estrutural
  reservado mas não usado.
- **Fronteira com conciliação:** unificar `BankStatement` sob `SourceDocument` (§8.4) reabre uma
  ilha recém-fechada (INCR-7) — refactor com blast radius; default é **não** unificar no MVP.

**PARECER PRONTO.** Entregar ao `luminaris-orchestrator` para montar o plano de skills **somente
após** a altitude (§8.1) e as demais decisões abertas serem ratificadas em ADR + sinal humano.

## 4. Mapa de reuso (reuse-antes-de-recriar — Contrato §0; confirmado por código)

| Reuso | O quê | Onde |
|---|---|---|
| **AccountingScope** | tenancy `userId`+`unitId`, `accountingScopeWhere` | `features/accounting/scope/AccountingScope.ts` |
| **`(sourceType,sourceId)` @@unique** | idempotência **existente** — âncora de identidade da origem (NÃO recriar) | `schema.prisma:433` |
| **PostingService.postEntry** | ponto onde a entry nasce com `sourceType`/`sourceId` — candidato a popular a origem na mesma tx (§8.5) | `features/accounting/services/PostingService.ts` |
| **IJournalEntryRepository.findBySource** | já resolve entry por `(sourceType,sourceId)` — base do drill-down | `repositories/IJournalEntryRepository.ts:48` · `JournalEntryRepository.ts:60` |
| **AuditService.append(tx, scope, event)** | auditoria in-tx hash-chain, se a origem virar evento | INCR-2 |
| **DocumentAttachment** | arquivo bruto do documento (link opcional de `SourceDocument`) | `services/DocumentAttachmentService.ts` (INCR-5) |
| **MAX_CENTS / money.ts** | teto Int32, se `SourceDocument` guardar valor de controle | `features/accounting/models/money.ts` |
| **BankStatement / ReconciliationMatch** | precedente de "documento-origem" first-class já modelado (referência de forma) | `schema.prisma:573-645` (INCR-7) |
| **Factory / rota-3-toques / DTO Zod `.strict()` / Policy** | scaffolding de camada | Contrato §2/§3 |

## 5. Modelo proposto (Prisma first-class — SUJEITO A ADR; forma para discussão)

> Forma para o ADR, **não** decisão final. Campos mínimos deliberados (mitiga shape especulativo).

- **`SourceDocument`** — o documento/evento de origem, first-class e uniforme:
  `id`, `userId`, `unitId` (scope strings), `sourceType` (mesma taxonomia viva: `manual` |
  `crm.opportunity.won` | `salon.sale.*` | `IMPORT_JOURNAL_ENTRIES` | …), `externalRef?` (**a
  referência humana do documento — separada do `sourceId`/idempotência**), `documentDate?`,
  `description?`, `attachmentId?` (link a `DocumentAttachment` do arquivo bruto), `rawJson?`
  (snapshot da origem, opcional), `createdById?`, timestamps, `deletedAt?`.
  Unicidade candidata: `@@unique([userId,unitId,sourceType,externalRef])` **somente se** `externalRef`
  for garantidamente único por origem — **senão, sem unique** (a idempotência mora no `JournalEntry`,
  T7; ver §8.2). `@@index([userId,unitId,sourceType])`.
- **`JournalEntrySource`** — vínculo **não-destrutivo** entry ↔ documento:
  `id`, `userId`, `unitId`, `journalEntryId` (FK), `sourceDocumentId` (FK), `createdAt`.
  `@@unique([journalEntryId, sourceDocumentId])`. Estrutura **N:M** reservada (um documento →
  vários lançamentos; um lançamento → vários documentos), mas o **MVP escreve 1 entry ← 1
  documento** (§8.3) — espelha o padrão "N:M estrutural, MVP-constrangido" da conciliação (D3).

**Back-relations:** `JournalEntry.sources JournalEntrySource[]`; `DocumentAttachment` ganha relação
opcional inversa só se `attachmentId` virar FK (senão fica plain string, como hoje).

**Regra dura:** `SourceDocument`/`JournalEntrySource` **não escrevem nenhum valor de ledger** —
não tocam `Posting`/débito/crédito/status. São camada **descritiva/de rastreio**. A idempotência
continua sendo `JournalEntry.@@unique([userId,unitId,sourceType,sourceId])` (T7).

## 6. Fluxo (MVP — contingente à altitude A1)

1. **No `postEntry`** (mesma tx): além de gravar `sourceType`/`sourceId` na entry (como hoje),
   **upsert** de um `SourceDocument` por `(userId,unitId,sourceType,sourceId)` e criação do
   `JournalEntrySource` ligando entry↔documento. Só para **novos** lançamentos — sem backfill (A1).
2. **Import DataExchange:** deixa de dobrar `externalReference` cegamente em `sourceId` — passa o
   `externalReference` para `SourceDocument.externalRef` e mantém `sourceId` como chave de dedup
   (hash `di:<sha>` quando não há ref). **Resolve o déficit concreto do §3.**
3. **Bridges (salão/CRM):** ao postar, populam `SourceDocument` com a referência da venda/oportunidade.
4. **Drill-down (leitura):** dado um `JournalEntry`, `sources[]` → `SourceDocument` → `attachmentId`
   → arquivo bruto. Base do que ECD/ECF consumirá.
5. **Relatório de pendências de origem** (opcional MVP): lançamentos oficiais sem `SourceDocument`
   (as-of) — futura base de auditoria de completude.

## 7. Fases de execução (esqueleto — contingente ao ADR; **não executar sem ele**)

1. **cbm** — provar ausência de `SourceDocument`/`JournalEntrySource`; mapear call-sites de
   `postEntry`/`findBySource`/todos os `sourceType:` literais (blast radius das origens).
2. **prisma-model** — `SourceDocument` + `JournalEntrySource` + back-relations + migração
   (+ **smoke-migration-gate** sobre backup do `dev.db` real — `accounting-incr1-db-risk`).
3. **repository** — repos + interfaces; `runTransaction` propagado a todo write (T6).
4. **policy** — `canRecordSource(scope)` (ou reusa a policy de accounting existente).
5. **service / extensão do `PostingService`** — popula origem na mesma tx do post (decisão §8.5);
   idempotência **inalterada**; guarda pré-tx via repo injetado.
6. **editar `DataExchangeImportService`** — desdobrar `externalReference`→`externalRef`, mantendo
   `sourceId`/dedup (resolve §3; regressão de idempotência obrigatória).
7. **dto** — Zod `.strict()`.
8. **controller + rota (3 toques)** — só se houver endpoint de leitura de proveniência no MVP;
   senão, interno (sem rota).
9. **factory** — wiring.
10. **test-suite** — atomicidade origem+entry; **idempotência T7 byte-idêntica** (regressão);
    `externalRef`≠`sourceId` (colisão cross-origem não acontece); no-cascade; tenancy cross-unit
    404; drill-down entry→documento→anexo.
11. **api-contract-sync** — `docs:generate` + i18n (se houver rota).
12. **luminaris-reviewer** — worktree isolado, do zero.

## 8. Decisões ABERTAS — exigem ADR + sinal humano (`DECISÃO ARQUITETURAL`)

1. **[META — a decisão-gate] Altitude & timing.** Construir agora ou diferir até ECD/ECF ser
   escopado? Se agora, qual altitude:
   - **A0 — Diferir.** Consumidor (ECD/ECF) não-escopado → risco de shape errado; YAGNI. Fecha o
     déficit do §3 (se incomodar) com **uma** coluna `JournalEntry.externalReference` isolada,
     sem tower. *(Posição ponytail-estrita; genuína.)*
   - **A1 — Seam fino.** `SourceDocument` + `JournalEntrySource` first-class, populados **só em
     novos writes**, **sem backfill**, idempotência (T7) **intocada**. Estabelece o alvo de
     drill-down e resolve o déficit §3. *(Recomendação do agente se o roadmap for adiante — custo
     baixo, risco baixo.)*
   - **A2 — Formalizar + backfill + retrofit.** A1 + migrar origens existentes + depreciar as
     colunas string. **Toca a idempotência viva (T7) → alto risco; não recomendado sem ECD/ECF.**
2. **Idempotência vs. `SourceDocument`.** `SourceDocument` fica **ao lado** de
   `(sourceType,sourceId)@@unique` (recomendado, preserva T7) ou ganha unicidade própria? Se ganhar,
   liga em `(sourceType,externalId)`, **nunca** `userId`. *(Mover a idempotência para cá reabre T7.)*
3. **Cardinalidade `JournalEntrySource`.** N:M estrutural com MVP 1↔1 (recomendado) ou já habilitar
   1 documento→N entries (splits) / N documentos→1 entry (settlement citando nota+pagamento)?
4. **`BankStatement`/`BankStatementLine` viram `SourceDocument`?** Unificar o extrato (INCR-7) sob
   a nova abstração, ou deixá-lo como ilha própria e cobrir só as origens `sourceType`-driven
   (recomendado no MVP — não reabrir INCR-7)?
5. **Quem popula a origem.** Estender `PostingService.postEntry` para criar `SourceDocument`+
   `JournalEntrySource` na mesma tx (recomendado — nasce atômico), ou serviço/bridge separado
   pós-commit por origem?
6. **`externalReference` isolado.** Além de `SourceDocument.externalRef`, promover também um campo
   `JournalEntry.externalReference` (para o A0, ou como conveniência de query)? Ou a referência
   vive **só** em `SourceDocument`?
7. **No-cascade vs cascade do `User`.** `SourceDocument` sobrevive ao delete do usuário (no-cascade,
   recomendado — origem é evidência, ACC-020) mesmo que `JournalEntry.userId` seja cascade hoje?

## 9. Definition of Done (quando houver ADR)

ADR ratificado · camadas completas · `tsc` limpo (2 pacotes) · Jest verde (sem regredir) ·
skill-audit `wiring` · `docs:generate` (se rota) · **smoke-migration-gate** (dados vivos) · review
por agente independente PASS. **Invariantes:** nenhum valor de ledger muda; **idempotência T7
regressão byte-idêntica**; `externalRef` separado de `sourceId` provado por teste; no-cascade
provado; drill-down entry→documento funcional.

## 10. Riscos

- **Especulação de shape** sem ECD/ECF (§3 risco) — mitigado por seam fino + campos mínimos.
- **Backfill toca T7** (só A2) — smoke-gate obrigatório; prova de idempotência inalterada.
- **Reabrir a ilha da conciliação** (§8.4) — default é não unificar.
- **Conflação idempotência×referência persistente** se o import não for corrigido (§6.2) —
  o seam sem corrigir o `journalSourceId` não entrega o único ganho concreto.
- **Migração com colunas novas** → smoke-gate antes de dados reais (`accounting-incr1-db-risk`).

---

## 11. PROMPT PARA A PRÓXIMA SESSÃO (após ratificação do ADR)

```text
Atue no módulo de contabilidade do Luminaris. BE-INCR-7 (conciliação) está 100% fechado em main
(06462ac). O ADR-INCR8-source-document-provenance.md está ratificado (altitude A1 — seam fino, sem
backfill, T7 intocada). Leia INTEIRO: docs/adr/ADR-INCR8-source-document-provenance.md,
docs/accounting/BE-INCR8-source-document-provenance-scope-brief.md, _ARCHITECTURE-CONTRACT.md §2.1,
CLAUDE.md STOP block. Acione luminaris-orchestrator → luminaris-implementer: Prisma first-class,
camadas completas, popular SourceDocument+JournalEntrySource na tx do postEntry, desdobrar
externalReference→externalRef no import (mantendo sourceId/dedup), testes de idempotência-T7-regressão
byte-idêntica + atomicidade + no-cascade + tenancy. PR pequeno, worktree isolado, review independente,
smoke-migration-gate antes de dados reais, closeout promove o nó no master map (ORCH-007) + learning-log.
FORA DE ESCOPO: ECD/ECF, OFX/CNAB/NF-e, backfill (A2), unificar BankStatement, reescrever idempotência.
```
