# SMOKE-MIGRATION-GATE-INCR-INVENTORY — Relatório de Execução (dev.db real, rebuild de `payables`)

- **Data:** 2026-07-22
- **Executado por:** Agente (worktree `incr-inventory-smoke-test-4cfa1c`, branch a partir de `main` `28c247a`)
- **Migration alvo:** `20260720115019_add_inventory_subledger` (INCR-INVENTORY, PR #130) — 2× `CREATE TABLE`
  (`inventory_items`, `stock_movements`) + 4 índices **e** `RedefineTables` de `payables`
  (`expenseAccountId` NOT NULL → NULL + 2 colunas novas) = **rebuild** temp+copy+drop+rename, não `ADD COLUMN`.
- **Resultado:** **PASS.** As 4 linhas de `payables` (+1 `payable_payments`) escritas pelo Prisma sobrevivem ao
  rebuild **byte-a-byte**; FKs e os 3 índices voltam; `integrity_check`/`foreign_key_check` limpos; dado real
  do banco vivo intacto (41 contas, 15 lançamentos, 30 partidas, 92 audit events).
- **Achado (não-FAIL, latente):** a FK `payables.expenseAccountId → accounts(id)` **mudou de `RESTRICT` para
  `SET NULL`** no rebuild (consequência automática de a coluna virar opcional no Prisma). Ver §Achado.

> Por que o gate não era dispensável: `expenseAccountId` nullable rebuilda a tabela inteira no SQLite —
> rebuild malfeito dropa FK/índice/linha em silêncio (BE-INCR-INVENTORY-impl-plan.md §Riscos).

## Por que a base viva sozinha NÃO fechava o gate (armadilha do gate vazio)

O `dev.db` real (`server/prisma/prisma/dev.db`, memória `dev-db-real-path-is-nested`) já está com a migração
aplicada (28/28) desde o re-seed de 2026-07-22 — **mas tem `payables` = 0 linhas**. Rodar o gate ali seria
vacuoso: "sobreviveu" sem nada a sobreviver (mesma classe do A1 do gate anterior, memória
`accounting-gargalo-is-human-validation`). O gate real exigiu **estado pré-migração com linha viva**.

## Isolamento (nunca tocar o banco real)

| Passo | Evidência |
|---|---|
| Banco real | `server/prisma/prisma/dev.db` — md5 `d602831542eea0738c77b4fa285d2368`, 1.159.168 bytes, mtime 2026-07-22 01:17 |
| Backup pré-reseed (base do gate) | `server/prisma/prisma/dev.db.bak-pre-reseed-20260722` — md5 `78c3d391a29acf54aec6170307fee3fd`; `migrate status` = **exatamente 1 pendente**, a de inventário |
| Execução | só em cópias no scratchpad (`live-copy.db`, `bak-copy.db`, `pre/pre.db`), `DATABASE_URL` apontado explicitamente |
| Prova de não-toque | md5 dos DOIS arquivos originais idênticos antes e depois de toda a operação |

## Execução A — dev.db REAL (backup pré-inventário) + `payables` escritas pelo Prisma

Cópia do backup real (41 contas, 15 lançamentos, 30 partidas, 92 audit events, 2 users) semeada com o **client
Prisma da schema PRÉ-inventário** (gerado de `5c04bd1^1`) — datas gravadas como `INTEGER` ms-epoch, formato real
do app, não SQL sintético (memória `sintetico-nao-cobre-formato-de-dado-real`). Fixture escolhida para pegar os
cantos do rebuild: `documentNumber` preenchido, `documentNumber` NULL, linha `PAID` com pagamento filho, e linha
soft-deleted com `documentNumber` renomeado (`deleted:<id>:<doc>`) — as três formas que a `@@unique` trata.

| Check | Resultado |
|---|---|
| `migrate status` (pré) | 1 pendente — `20260720115019_add_inventory_subledger` |
| `migrate deploy` | **PASS** — aplicou limpa |
| `payables` (4 linhas, TODAS as colunas + `typeof()` de cada data) | **byte-a-byte idênticas** antes/depois — incl. `documentNumber` NULL, `deletedAt`, `deleted:` rename, datas ainda `integer` ms-epoch |
| `payable_payments` (filho CASCADE) | **byte-a-byte idêntico**; 1 linha, `payableId` ainda resolve |
| `PRAGMA integrity_check` | **PASS** (`ok`) |
| `PRAGMA foreign_key_check` | **PASS** (0 violações) |
| Índices de `payables` | **3/3 de volta** — `_status_idx`, `_dueDate_idx`, `_supplierName_documentNumber_key` (+ autoindex do PK) |
| FKs de `payables` | 3/3 presentes (`userId`→User CASCADE, `expenseAccountId`→accounts, `counterpartyId`→counterparties SET NULL) — **ação do `expenseAccountId` mudou, ver §Achado** |
| Dado real inalterado | **PASS** — `accounts`=41, `journal_entries`=15, `postings`=30, `audit_events`=92 (baseline dos gates INCR-1/2) |
| Tabelas novas + índices | **PASS** — `inventory_items`/`stock_movements` criadas vazias; 4 índices novos presentes, incl. `stock_movements_inventoryItemId_kind_sourceType_sourceId_key` |
| Total de tabelas | 44 |

## Execução B — mesmo rebuild em banco fresh (controle) + escritas pós-migração com o client ATUAL

Banco fresh migrado até `20260715205436` (pré-inventário), semeado com a mesma fixture, migrado e re-conferido:
**idêntico ao resultado A** (4/4 linhas byte-a-byte, integridade/FK limpas, 3 índices de volta). Sobre esse
banco já migrado, escritas com o client **atual** (formato real do app):

| Check de aplicação | Resultado |
|---|---|
| `Payable` de compra com `expenseAccountId: null` + `inventoryProductRef`/`inventoryQty` | **PASS** — a coluna aceita NULL de fato (era o motivo do rebuild); campos novos gravam |
| `InventoryItem` + `StockMovement` (RECEIPT, 10 un., 250000¢) | **PASS** — subrazão aceita escrita do app |
| **Backstop de idempotência** — 2º movimento com `(inventoryItemId, kind, sourceType, sourceId)` repetido | **PASS** — rejeitado com **P2002** (a `@@unique` D-b é constraint de banco, não promessa de app) |
| **Tie-out** Σ`valueCentsDelta` == `totalValueCents` e Σ`qtyDelta` == `qtyOnHand` após COGS (−3 un., −75000¢) | **PASS** — 175000¢ == 175000¢, 7 == 7 |
| Cascade `inventory_items` → `stock_movements` | **PASS** — apagar o item levou os 2 movimentos (0 órfãos) |

## Achado: FK `expenseAccountId` relaxou de RESTRICT para SET NULL

Medido (`PRAGMA foreign_key_list('payables')`):

- **antes:** `accounts <- expenseAccountId on_delete=RESTRICT`
- **depois:** `accounts <- expenseAccountId on_delete=SET NULL`

Efeito colateral automático do campo virar opcional (default do Prisma para relação opcional). O gate do
INCR-AP tinha registrado o `RESTRICT` como guarda ("conta-despesa com payable não pode ser apagada").

**Por que NÃO é FAIL hoje:** o caminho não existe em runtime — `AccountRepository` é **soft-delete universal**
("delete é um update de `deletedAt`") e não há nenhum `account.delete`/`deleteMany` em código de produção
(`grep` em `server/src`, só o `eventType: 'account.deleted'` do audit). A proteção efetiva é o guard de
aplicação, não a FK. Fica registrado como **risco latente**: se algum dia entrar hard-delete de conta, um
payable perde silenciosamente a contrapartida em vez de bloquear.

## Fora de escopo deste gate (honestidade)

- **Não** roda a suíte accounting de novo — 762/762 verdes já registradas no closeout do PR #130 (`5c04bd1`).
- **Não** exercita `InventoryService`/`SalonSaleCogsMapper` end-to-end pela cadeia de camadas: as escritas da
  Execução B são via Prisma client, provando **banco**, não serviço. Comportamento de serviço está coberto por
  `InventoryService.test.ts` + `InventoryCogs.integration.test.ts`.
- **Não** substitui o **browser sign-off** da seção `costOfGoodsSold` do DRE (FE diferido) — residual aberto.

## Veredicto

| Item | Veredicto |
|---|---|
| `20260720115019_add_inventory_subledger` sobre dev.db real (cópia) com `payables` vivas | **PASS** — rebuild preserva linhas byte-a-byte, FK/índices/integridade íntegros, dado real intacto |
| Não-toque nos bancos originais | **PROVADO** — md5 idêntico antes/depois nos dois arquivos |
| Deploy-readiness da migração de inventário | **DEPLOY-CLEARED** para a migração |
| RISK — FK `expenseAccountId` RESTRICT→SET NULL | **ABERTO (latente, baixo)** — inalcançável enquanto conta só tem soft-delete |
| Browser sign-off do DRE (CMV) | **ABERTO** — continua residual humano |
