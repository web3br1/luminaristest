# PLANO DE EXECUÇÃO — INCR-INVENTORY (estoque perpétuo + CMV + ponte de compra AP)

> Artefato de handoff para o `luminaris-implementer`, produzido pelo par orquestrador + council +
> workflow `inventory-impl-plan` (4 leitores paralelos → planner → **crítico de completude adversarial** →
> reviser). Materializa `docs/adr/ADR-INCR-INVENTORY-stock-subledger.md` (ratificado fork-a-fork 2026-07-20).
> **Execução ULTRACODE (paralela).** O orquestrador NÃO implementa (ORCH-001); este é o plano.
>
> **Nota do crítico (2 linhas):** a passagem adversarial achou **3 furos reais confirmados em disco** que o
> 1º rascunho embarcaria — (1) o DRE não tem bucket `costOfGoodsSold` em `AccountingReportService`, logo a
> regra `dre.cogs` sumiria do net income (classe FAIL-1, D7 derrotado); (2) `reconcilePayables` resolve o
> débito por `expenseAccountId` e pula em `null`, deixando a compra de estoque órfã no re-drive e quebrando o
> tie-out Σ==saldo(1.1.6); (3) o `@@unique` do movimento dá REJECT, não o return-existing que o reconcile/job
> assumem. Os três estão dobrados no plano abaixo (passos B-2b/B-2c, A2c-2 twin, contrato D-c read-first).

**Tarefa.** Subrazão de estoque perpétuo first-class Prisma (`InventoryItem` + `StockMovement`), baixa de CMV
na venda de salão via seam pós-commit (mapper + bridge), custo médio ponderado em centavos-Int, estorno ao
custo original, ponte de compra AP→estoque. Item 12 da fila §5.1 do master map. SEM frontend (F-INV2 difere),
SEM superfície HTTP nova.

**Intenção (T1).** Espelhar o par AP/AR (subrazão Prisma dedicada, conta de controle, tie-out ao razão) para
estoque. Contabilidade = Prisma first-class; bridges = integração pós-commit (NÃO DynamicTable, NÃO injeta
serviço Prisma no motor de plugins §2.1); CMV posta via `postEntry` (mapper aditivo), nunca dentro do
`DynamicTableService`. NÃO se usa controller/route generator nem 3-toque de rota.

**Risco principal.** Dois deltas de schema tocam artefato vivo: o `ALTER payables` que torna
`expenseAccountId` nullable é rebuild de tabela no SQLite → smoke-migration-gate obrigatório no `dev.db` real
aninhado (`server/prisma/prisma/dev.db`). E o CMV/custo médio é o único ponto SEM espelho mecânico de AP/AR
(divmod em centavos) — se `valueDelta` vazar sub-centavo, o tie-out Σ`StockMovement.valueCentsDelta` ==
`InventoryItem.totalValueCents` == saldo(1.1.6) quebra.

**Base verificada em disco (CBM-001).** `1.1.1–1.1.5` e `4.1` tomadas → `1.1.6` (Estoques/Asset) e `4.2`
(CMV/Expense) são os próximos livres (o "1.1.3 Estoque" do fork era typo; 1.1.3 = Caixa). `postEntry`
idempotência `@@unique([userId,unitId,sourceType,sourceId])` schema.prisma:510. `postEntry` abre tx-raiz
própria, NÃO aceita handle externo (`PostingService.ts:164`). DRE: `IncomeStatementReport` sem bucket
`costOfGoodsSold` (`AccountingReportService.ts:115-122`, `computeDreNet` :195-218). `reconcilePayables`
resolve débito por `expenseAccountId` (`PayableService.ts:406`, post via `buildRecognitionInputFromRow`
:413/:551).

**Branch.** Base de integração `claude/incr-inventory` (recebe Fase 0). Worktrees de corpo:
`claude/incr-inventory-core` (Body 1), `claude/incr-inventory-cogs` (Body 2), `claude/incr-inventory-ap`
(Body 3), cada um `npm ci` + `prisma generate` do commit de schema da Fase 0 (worktree-deps-stale-prisma-
client). Fanout via skill `parallel-batch`.

## Passos

| # | Skill (SKILL_MATRIX) | Argumentos | Arquivos esperados (paths reais) | Motivo |
|---|---|---|---|---|
| **F0-1** | `backend-prisma-model-generator` | 2 models + back-relation + ALTER Payable, UMA passada | `server/prisma/schema.prisma` | `model InventoryItem @@map("inventory_items")` (CREATE) + `model StockMovement @@map("stock_movements")` (CREATE) + back-relation `inventoryItems InventoryItem[]` em `User` + ALTER `Payable`: add `inventoryProductRef String?` + `inventoryQty Int?`, tornar `expenseAccountId String?` (nullable). Chaves = Decisões D-a/D-b. |
| **F0-2** | — (comando prisma) | `prisma migrate dev --name add_inventory_subledger` em worktree fresca (`npm ci` antes) | `server/prisma/migrations/<ts>_add_inventory_subledger/migration.sql` | Migração ÚNICA = 2× `CREATE TABLE` + índices/uniques + ALTER `payables` (rebuild). smoke-migration-gate no `server/prisma/prisma/dev.db` REAL (dev-db-real-path-is-nested), linhas semeadas via Prisma (sintetico-nao-cobre-formato-de-dado-real). |
| **F0-3** | — (edição de fixture aditiva) | 2 folhas + 2 consts | `server/src/features/accounting/fixtures/ChartOfAccountsFixture.ts` | `{code:'1.1.6',name:'Estoques',nature:'Asset',acceptsEntries:true}` + `{code:'4.2',name:'Custo das Mercadorias Vendidas',nature:'Expense',acceptsEntries:true}`; export `ESTOQUES_CODE='1.1.6'`, `CMV_CODE='4.2'`. **Fase 0** (Decisão O-1): Body 1 (tie-out) e Body 2 (mapper) dependem; zero migração (create-if-missing por code). |
| **A1-1** | `backend-dto-generator` | Zod `.strict()`, helpers `cents`/`dateOnly` | `server/src/features/accounting/dtos/InventoryDto.ts` | `ReceiveStockSchema`, `ListInventoryQuerySchema`, `InventoryScopeQuerySchema` (espelho `PayableDto.ts`). `unitCostCents`/`totalValueCents` guardados por `MAX_CENTS` (models/money.ts). D5: valoração nasce em centavos Int. |
| **A1-2** | — (consts de domínio) | espelho `Payable.model.ts` | `server/src/features/accounting/models/Inventory.model.ts` | `STOCK_MOVEMENT_KINDS=['INBOUND','COGS','ADJUSTMENT','REVERSAL']`, `INVENTORY_ITEM_STATUSES=['ACTIVE','ARCHIVED']`, `INVENTORY_COGS_SOURCE_TYPE='salon.sale.cogs'`, `INVENTORY_INBOUND_SOURCE_TYPE='inventory.inbound'`. Tipos de linha vêm de `generated/prisma`. |
| **A1-3** | `backend-repository-generator` | `Prisma.TransactionClient?` em todo método (ACC-012) | `server/src/features/accounting/repositories/IInventoryRepository.ts` + `InventoryRepository.ts` | Único lugar com `prisma.inventoryItem.*`/`prisma.stockMovement.*`. Métodos: `create`, `findByProductRef` (âncora CAS/upsert do `@@unique`), `findById`, `findManyByUnit`, `updateItem`, `createMovement`, **`findMovementBySource(scope,{kind,sourceType,sourceId},tx?)`** (leitura-primeiro de idempotência — Gap 3), **`decrementForCogs`** (`updateMany where qtyOnHand>=qty` → count; D4), **`incrementForInbound`** (aumento atômico in-tx), `runTransaction`. `deletedAt:null` em reads de item; movements append-only. |
| **A1-4** | `backend-policy-generator` | 2 métodos ao lado do par Payable/Receivable | `server/src/features/accounting/policies/IAccountingPolicy.ts` + `AccountingPolicy.ts` | `canManageInventory(scope)` + `canReadInventory(scope)` = `return !!scope.actorUserId;` (coarse, idêntico a `canManagePayable`). |
| **A1-5** | `backend-service-generator` | injeta `(inventoryRepo, accountRepo, posting, auditService, policy)` | `server/src/features/accounting/services/InventoryService.ts` | Assinaturas travadas em D-c. `receiveStock` [INBOUND, subrazão-only, SEM post; **read-first `findMovementBySource` → se existe, retorna cents existentes sem mutar** (Gap 3)]; `recordSaleCogs` [SÓ tx1: **read-first `findMovementBySource` por (COGS, saleId+item) → replay retorna cents existentes**; senão resolve item, `valueDelta=Math.round(totalValueCents*qty/qtyOnHand)` D6, CAS `decrementForCogs` count===1 senão `ValidationError('estoque insuficiente')`, append COGS movement; **NÃO posta** — razão é do mapper]; `reverseStockForSale` [D8, re-crédito ao custo do movimento ORIGINAL, sourceId=reversalEventId]; `reconcileInventory` re-drive; reads `listInventory`/`getInventoryItem`. |
| **A1-6** | `backend-test-suite-generator` | suites Body 1 | `server/src/features/accounting/services/__tests__/InventoryService.test.ts` + `server/src/features/accounting/repositories/__tests__/InventoryCogs.integration.test.ts` | Gates §7: tie-out D6 (custos não-exatos), concorrência D4 (2 baixas → 1 vence), estorno ao custo original D8, idempotência-por-replay retorna cents existentes SEM 2º decremento/incremento (Gap 3), idempotência `@@unique` do movimento como backstop. Integração: `decrementForCogs` concorrente (espelho `PayableClaim.integration.test.ts`). |
| **A2b-1** | — (edição de integração pós-commit) | novo mapper + evento + loader + bridge | `sync/mappers/SalonSaleCogsMapper.ts` (create) · `sync/AccountingSyncPort.ts` (edit) · `sync/bridges/salonSaleItems.ts` (edit) · `sync/bridges/SalonSalesAccountingBridge.ts` (edit) | Body 2. Mapper `sourceType='salon.sale.cogs'`, `D 4.2 / C 1.1.6`, lê `event.costCents` (Int; guard `Number.isSafeInteger`/`>0`/`<=MAX_CENTS`). `AccountingSyncPort`: add `'salon.sale.cogs'` à union, `costCents?:number`, builder `buildSalonSaleCogsEvent`. `salonSaleItems`: `productLines:[{productRef,qty}]` só ramo Product. Bridge: 2ª emissão após receita, try/catch próprio (falha CMV NÃO desfaz receita), chama `recordSaleCogs`→`{totalCogsCents}`→`buildSalonSaleCogsEvent`→`sync`. |
| **A2b-2** | `backend-test-suite-generator` | suites Body 2 | `sync/mappers/__tests__/SalonSaleCogsMapper.test.ts` (create) · `sync/bridges/__tests__/salonSaleItems.test.ts` · `sync/bridges/__tests__/SalonSalesAccountingBridge.test.ts` | Mapper balanceado + rejeita não-Int/0/neg/>MAX_CENTS; `productLines` exclui Service/Package; venda não-package com produto → emissão DUPLA (finalized+cogs, sourceType distinto, mesmo saleId); serviço puro → só receita; all-package → nenhum; falha COGS isolada da receita. Mock `getFactory().getInventoryService()`. |
| **A2c-1** | `backend-dto-generator` | edit + `.superRefine` XOR | `server/src/features/accounting/dtos/PayableDto.ts` | `CreatePayableInput` ganha `inventoryProductRef?` + `inventoryQty?` + gate XOR: `expenseAccountId` XOR (`inventoryProductRef` AND `inventoryQty`); rejeita ambos/nenhum (param-aceito-e-ignorado-e-bug). |
| **A2c-2** | — (edição de service vivo — reuso) | ponte D3(b) + **twin reconcile** (Gap 2) | `services/PayableService.ts` · `models/Payable.model.ts` · `repositories/PayableRepository.ts` · `IPayableRepository.ts` | `isInventoryPurchase(payable)` predicate. `createPayable` ramifica: compra de estoque → `expenseAccountId=null`, débito `ESTOQUES_CODE` / crédito `FORNECEDORES_A_PAGAR_CODE`, `sourceType='ap.payable'`/`sourceId=payableId`; APÓS reconhecimento, `inventoryService.receiveStock({productRef,qty:inventoryQty,totalValueCents:amountCents,sourceType:'inventory.inbound',sourceId:payableId})`. **`reconcilePayables` E `buildRecognitionInputFromRow` ramificam em `isInventoryPurchase`** (Gap 2): para inventory payable NÃO resolvem `expenseAccountId` (=null → hoje pula em :406-408), e sim re-postam `D ESTOQUES_CODE / C FORNECEDORES_A_PAGAR_CODE` (`sourceType='ap.payable'`, `sourceId=payableId`) + 3º passo re-drive do INBOUND faltante. `cancelPayable`: REVERSAL ao custo original + `reverseEntry`. Injeta `IInventoryService` no construtor. Repo/interface: passar as 2 colunas + `expenseAccountId` nullable. |
| **A2c-3** | `backend-test-suite-generator` | casos de estoque em suite existente | `services/__tests__/PayableService.test.ts` | Compra estoque debita 1.1.6 (não expense) + chama `receiveStock` com sourceId=payableId; idempotência payableId; duplo-ENTRADA AP+seed valora uma vez; XOR DTO; cancel → REVERSAL ao custo original; **crash-recovery (Gap 2): inventory payable cujo reconhecimento ficou ausente → `reconcilePayables` posta o débito 1.1.6 e o tie-out Σ==saldo(1.1.6) fecha**. Atualiza aridade do construtor. |
| **B-1** | — (wiring Factory, serial) | 3 deltas, `tsc` verde entre cada | `server/src/lib/factory.ts` | (a) `new InventoryRepository()` + `new InventoryService(...)` + `getInventoryService` (reusa `AccountingPolicy`/`AuditService`); (b) append `new SalonSaleCogsMapper()` ao array do `AccountingSyncService`; (c) `PayableService` ganha a dep de inventory. NÃO é 3-toque público. |
| **B-2** | — (edição de fixture, lição FAIL-1) | regra + bump versão | `server/src/features/accounting/services/StatementMappingFixture.ts` | D7: `{id:'dre.cogs',statement:'DRE',match:{nature:'Expense',codePrefix:'4.2'},section:'costOfGoodsSold',sign:'debit_negative',order:250}` ANTES de `dre.expenses` (order 300); bump `STATEMENT_MAPPING_VERSION`. **NÃO basta a fixture — ver B-2b.** |
| **B-2b** | — (edição de report vivo — Gap 1, obrigatório) | novo bucket no DRE | `server/src/features/accounting/services/AccountingReportService.ts` | **Sem isto a regra `dre.cogs` é silenciosamente descartada de `netCents` (classe FAIL-1, D7 derrotado).** (1) `IncomeStatementReport` (:115-122) ganha `costOfGoodsSold: StatementSection`; (2) `computeDreNet` (:195-218) ganha `else if (rule.section === 'costOfGoodsSold') cogsCents += signed;` e inclui `cogsCents` em `netCents`; (3) `incomeStatement()` (:512-528) chama `buildSection(dreRows,'DRE','costOfGoodsSold')` e retorna o campo. |
| **B-2c** | `backend-test-suite-generator` | teste report-level (Gap 1) | `services/__tests__/AccountingReportService.test.ts` (edit/create) | Posta lançamento CMV (`D 4.2 / C 1.1.6`) e afirma que o valor cai em `costOfGoodsSold` (NÃO em `expenses`) e que `netCents` cai pelo CMV. Fixture cross-nature (BP/DRE-diagnostics lição: não usar fixture same-statement). |
| **B-3** | — (edição de allowlist audit) | chaves de evento realmente emitidos | `server/src/features/accounting/audit/auditCanonical.ts` | Add ao `PAYLOAD_ALLOWLIST` só eventos que a impl EMITE (`inventory.received`, `inventory.reversed`; confirmar se CMV reusa `entry.posted` via `sourceType='salon.sale.cogs'`). Id/qty/centavos-como-string; NUNCA productRef→nome nem custo float (T8). |
| **B-4** | `job-generator` (edição do job) | passo de re-drive CMV | `server/src/jobs/accountingSyncReconcile.job.ts` | Rede de durabilidade: venda Finalized não-package sem `salon.sale.cogs` → re-drive `recordSaleCogs` (**idempotente por read-first, retorna cents existentes** — Gap 3) + `buildSalonSaleCogsEvent` + `doSync`. Recupera crash entre tx1/tx2. |
| **B-5** | `luminaris-reviewer` (agente independente, worktree separado) | por branch: Body 1, Body 2, Body 3 | — | reviewer-independence: PASS da sequência que implementou é rejeitado. |

## Ordem obrigatória (dependências)

1. **Fase 0 fecha inteira** (schema + migração + smoke-gate + ChartOfAccounts) na base ANTES de qualquer
   worktree de corpo — barrier estrito PAR-004. Devolve o SHA do commit de schema.
2. **Body 1 (A1) fecha, é revisado e mergeia na base ANTES de A2** — Body 2 e Body 3 CHAMAM `InventoryService`
   (aresta CALLS de build), logo Body 1 é predecessor-barrier, não peer paralelo (PAR-005). Cada worktree de A2
   garante `git merge-base --is-ancestor <sha-base-pós-A1> HEAD` + `npm ci` + `prisma generate`.
3. **Fase B só abre depois de A2 fechar** (Body 2 e Body 3 mergeados na base). Factory/report/fixture/audit/job
   registram corpos prontos.
4. `tsc` verde é barrier entre CADA delta de Fase B. Choke-point único `factory.ts` tem 3 edições → serializa as
   três entre si. B-2/B-2b/B-2c formam uma sub-sequência serial (fixture → report → teste) no mesmo domínio DRE.

## Plano de paralelização (PAR-006, 3 fases)

- **Fase 0 — serial (na base):** `schema.prisma` (2 CREATE + ALTER payables) numa migração + `ChartOfAccounts
  Fixture` (aditiva). History de migração diverge entre worktrees ⇒ obrigatoriamente serial. Choke-point mais duro.
- **Fase A — paralela com barrier interno:**
  - **A1 (Body 1, sozinho):** DTO + IInventoryRepository/InventoryRepository + policy + InventoryService +
    model + testes. Write-set = **só arquivos NEW** (+2 edições em interface/impl de policy, exclusivas deste
    incremento). Fecha, review, merge.
  - **A2 (Body 2 ∥ Body 3, verdadeiramente paralelos):**
    - **Prova de disjunção (PAR-002):** Body 2 write-set = {`sync/mappers/SalonSaleCogsMapper.ts` (novo),
      `sync/bridges/SalonSalesAccountingBridge.ts`, `sync/bridges/salonSaleItems.ts`, `sync/Accounting
      SyncPort.ts` + testes}. Body 3 write-set = {`services/PayableService.ts`, `dtos/PayableDto.ts`,
      `models/Payable.model.ts`, `repositories/PayableRepository.ts`, `IPayableRepository.ts` + teste}.
      **Interseção = ∅.** `factory.ts` e `AccountingReportService.ts` estão FORA de ambos (registro/report =
      Fase B) — dependência Body2→Body1 e Body3→Body1 é CALLS/build (resolvida por A1 mergeado + mocks),
      nunca conflito de merge.
- **Fase B — serial (na base):** `factory.ts` (3 deltas), `StatementMappingFixture` → `AccountingReport
  Service` → teste report (B-2/B-2b/B-2c), `auditCanonical`, `accountingSyncReconcile.job`. Conflito vira
  append trivial em série, nunca 3-way.
- **Honestidade PAR-005 (D-d):** increment SAME-DOMAIN (tudo accounting) sobre módulo vivo + 2 deltas de
  schema + Body 2/3 EDITAM arquivos vivos ⇒ paralelismo seguro REAL = **1 par (Body 2 ∥ Body 3)**. Body 1 e
  todo o registro são serial. Reportado, não inflado.

## Checks de validação

- `cd server && npx tsc --noEmit` verde após A1, após cada corpo de A2, e após cada delta de Fase B. (my-app
  NÃO tocado — F-INV2.)
- `cd server && npx jest src/features/accounting` verde (mapper, bridge, salonSaleItems, InventoryService,
  PayableService, integração CAS, **AccountingReportService CMV**).
- `skill-audit` gate `wiring`: aridade do construtor de `PayableService`/`InventoryService` registrada em
  factory, folhas 1.1.6/4.2 registradas, sem órfão tsc-blind.
- Sem `@openapi` novo em geral ⇒ regen de `my-app/public/openapi.json` não disparado. **Exceção:** se
  `PayableController` documenta o DTO de `createPayable`, os 2 campos opcionais podem exigir 1 regen serial via
  `npm run docs:generate`.
- smoke-migration-gate no `server/prisma/prisma/dev.db` real, linhas semeadas via Prisma: payables com
  histórico postado sobrevivem ao rebuild com FK/índices intactos.

## Gates de domínio obrigatórios (§7 do ADR)

1. **TOCTOU / D4:** 2 `recordSaleCogs` paralelos no mesmo SKU → exatamente 1 vence, 1 rejeita
   `'estoque insuficiente'`, `qtyOnHand` nunca negativo (CAS `decrementForCogs`, count===1).
2. **Tie-out / D6:** Σ`StockMovement.valueCentsDelta` == `InventoryItem.totalValueCents` == saldo(1.1.6)
   sobre sequência LONGA de custos não-exatos — único ponto sem espelho mecânico de AP/AR.
3. **Arredondamento custo médio:** `valueDelta` SEMPRE de (`totalValueCents` Int ÷ `qtyOnHand` Int) com
   resíduo absorvido; jamais `unitCost` float persistido.
4. **Duplo-entrada AP+seed:** mesma compra via ponte AP + seed manual valora o SKU UMA vez (idempotência por
   `sourceId=payableId` + read-first).
5. **Duplo-decremento venda+replay:** replay do mesmo `saleId` retorna cents existentes SEM 2º decremento
   (read-first `findMovementBySource`, backstop `@@unique(inventoryItemId,kind,sourceType,sourceId)`) e não
   duplica lançamento (`postEntry @@unique`).
6. **Estorno / D8:** REVERSAL re-credita ao custo do movimento ORIGINAL (não avg corrente, F-INV6); `sourceId`
   do estorno = `reversalEventId` ≠ chave da baixa (classe APURACAO D5).
7. **CMV no DRE / D7 (Gap 1 — reforçado):** conta 4.2 cai em `costOfGoodsSold`, NÃO em `expenses` (order
   250<300) **E o report REALMENTE soma o bucket em `netCents`** — `computeDreNet`/`IncomeStatementReport`/
   `incomeStatement()` editados (B-2b) e teste report-level (B-2c) afirmam net cai pelo CMV. A fixture sozinha
   (B-2) é insuficiente.
8. **Crash-recovery AP→estoque (Gap 2):** inventory payable com reconhecimento ausente → `reconcilePayables`
   (ramificado em `isInventoryPurchase`, twin `buildRecognitionInputFromRow`) posta o débito 1.1.6 (não pula
   por `expenseAccountId=null`) e o tie-out fecha.

## Riscos

- **Gap de atomicidade (declarar, não maquiar):** `postEntry` abre tx-raiz própria e NÃO aceita handle externo
  (`PostingService.ts:164`); SQLite sem nesting. A baixa CAS (tx1, subrazão) e o post do CMV (tx2, razão) são
  commits DIFERENTES — mesma janela de crash do AP. Convergência = `reconcileInventory`/reconcile job re-drive;
  o read-first + `@@unique` do movimento tornam o re-drive seguro. NÃO fabricar tx única nem injetar escrita de
  estoque no `PostingService` (§2.1). "MESMA tx do post do AP" (D3 do ADR) NÃO é literalmente alcançável — é o
  precedente reconhecimento+settlement do AP.
- **Rebuild de tabela SQLite:** `expenseAccountId` nullable rebuilda `payables` (temp+copy+FK), não é ADD
  COLUMN. Rebuild malfeito dropa FK/índice/linha silenciosamente → smoke-gate no dev.db real semeado obrigatório.
- **DRE bucket ausente (Gap 1 — RESOLVIDO no plano):** confirmado em disco que `AccountingReportService` NÃO
  tinha `costOfGoodsSold`; B-2b edita `IncomeStatementReport`/`computeDreNet`/`incomeStatement()` e B-2c cobre
  com teste. Sem B-2b a linha de CMV some do net (FAIL-1). FE income-statement não mostra a seção nova até
  browser sign-off, mas o net fica API-correto.
- **Reconcile twin ignorando inventory payable (Gap 2 — RESOLVIDO no plano):** confirmado que
  `reconcilePayables` :406 resolve por `expenseAccountId` e pula em null; A2c-2 ramifica `reconcilePayables` E
  `buildRecognitionInputFromRow` em `isInventoryPurchase`, com teste crash-recovery (Gate 8).
- **Semântica de idempotência do movimento (Gap 3 — RESOLVIDO no plano):** `@@unique` sozinho dá REJECT (P2002
  → rollback → throw), não return-existing; B-4 e `reconcilePayables` assumem return-existing. D-c manda
  `recordSaleCogs`/`receiveStock` fazerem `findMovementBySource` PRIMEIRO e retornarem os cents existentes sem
  mutar; `@@unique` vira backstop. Teste em A1-6.
- **Chave de idempotência do movimento:** adotado `@@unique([inventoryItemId, kind, sourceType, sourceId])`
  (por-item), NÃO `[userId,unitId,sourceType,sourceId]` — venda multi-item gera N movimentos COGS com mesmo
  `sourceId=saleId` e `inventoryItemId` distintos. Ver D-b.
- **Ambiguidade D2 mapper vs post-direto:** o ADR diz "mapper ao lado do SalonSaleFinalizedMapper" E "postEntry
  direto sem port especulativo". Reconciliação (O-2): `recordSaleCogs` faz SÓ a subrazão (tx1, retorna cents);
  o razão é postado pelo `SalonSaleCogsMapper` via `AccountingSyncService.sync` (tx2). O implementer confirma
  essa leitura antes de codar.
- **Viés do orquestrador (nomeado):** os quatro mapas discordam de escopo. Resolvido a favor do escopo do
  TÍTULO (subrazão + CMV + ponte AP = tudo dentro), mapper para D2, paralelismo A1→A2. Se o humano quiser D3(b)
  como incremento IRMÃO (remove o rebuild `payables` deste PR), Body 3 sai e o lote vira serial puro.

## Decisões a registrar (learning-log)

- **O-1** ChartOfAccountsFixture (1.1.6/4.2) MOVIDO para Fase 0: dependência compartilhada de Body 1 (tie-out) e
  Body 2 (mapper); um dono, zero colisão.
- **O-2** D2 reconciliado: subrazão (tx1, `recordSaleCogs`→cents) SEPARADA do post do razão (tx2,
  `SalonSaleCogsMapper`); CAS-before-post com mapper aditivo.
- **D-a** `InventoryItem.@@unique([userId,unitId,productRef])` (uma linha de valoração viva por produto×unidade
  — fecha TOCTOU do upsert/CAS).
- **D-b** `StockMovement.@@unique([inventoryItemId,kind,sourceType,sourceId])` — por-item, cobre venda
  multi-item.
- **D-c** Assinaturas travadas + **read-first de idempotência** (Gap 3): `receiveStock(scope,{productRef,qty,
  totalValueCents,occurredAt,sourceType,sourceId,description})` [FIRST `findMovementBySource`→se existe retorna
  cents existentes sem mutar]; `recordSaleCogs(scope,{saleId,unitId,occurredAt,lines})→{totalCogsCents}` [FIRST
  `findMovementBySource` por movimento COGS→replay retorna cents existentes]; `reverseStockForSale(scope,
  {saleId,reversalEventId,reversalDate})`. `receiveStock` recebe TOTAL em centavos (AP passa `amountCents`; seed
  pré-calcula `qty*unitCostCents` guardado por MAX_CENTS) — evita arredondamento por-unidade.
- **D-d** Paralelismo honesto = 1 par (Body 2 ∥ Body 3); Body 1 + todo registro serial (PAR-005).

## Closeout (ORCH-007)

- Promover o nó §5.1 item 12 no `docs/accounting/ACCOUNTING-MASTER-MAP.md` de "fila humana-ratificada" para
  MERGED, re-buscando `origin/main` antes do fold (accounting-master-map-source-of-truth).
- **Re-sequenciar NF-e (re-priorização do dono 2026-07-20):** mover NF-e (§5.1 Bloco B item 11) de ⚫ diferido
  genérico para o **PRÓXIMO incremento** e abrir `ADR-INCR-NFE` (ver seção seguinte).
- Emitir `learning-log` com O-1/O-2/D-a..D-d.
- Residual esperado (não bloqueia merge, bloqueia deploy): smoke-migration-gate no dev.db real + browser
  sign-off do DRE (nova seção `costOfGoodsSold`) — gargalo permanece validação humana + PVA + nunca-deployado.
- Re-rodar `skill-audit` (gate `wiring`) — devido desde o Parallelization Contract layer.

---

## PRÓXIMO INCREMENTO (sequenciado logo APÓS este) — NF-e (`ADR-INCR-NFE`)

Re-priorização do dono (2026-07-20): NF-e deixa de ser ⚫ diferido genérico e passa a ser a frente
**imediatamente seguinte** ao estoque. **NÃO é fase deste PLAN** — é incremento próprio, começa por ADR +
fork-a-fork. Consome a costura pronta deste incremento:

1. **Ancoradouro já entregue:** a ponte de compra **AP→estoque** (D3(b) deste plano) é o ponto onde a NF-e de
   compra encaixa — a NF-e apenas **pré-preenche a `Payable`** (`inventoryProductRef`/`inventoryQty`/
   `amountCents`), sem novo caminho de valoração.
2. **Escopo do NF-e (a decidir no ADR próprio):** parser do XML da nota (campo-a-campo, lição I052 como ECD/ECF),
   subrazão FISCAL; NF-e de venda pode cruzar com o CMV já lançado. Domínio fiscal pesado → ADR + ratificação
   fork-a-fork próprios antes de qualquer código (ORCH-006).
3. **Gate de abertura:** só depois deste incremento de estoque fechar (merge + closeout). Registrado no
   `ADR-INCR-INVENTORY §6` e neste Closeout.
