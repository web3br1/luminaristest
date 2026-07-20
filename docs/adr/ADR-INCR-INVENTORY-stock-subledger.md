# ADR-INCR-INVENTORY — Estoque (subrazão de inventário perpétuo + CMV)

- **Data:** 2026-07-20
- **Status:** **Proposed — FASE 1 (parecer + ADR). Desenho arquitetural DECIDIDO; ratificação fork-a-fork
  COMPLETA (2026-07-20).** Nó ⚫ **DIFERIDO** no master map §5.1 (Bloco B item 12); a regra §1 proíbe rotear
  código contra um nó ⚫ sem **ADR em disco + sinal humano** — este ADR é a metade "ADR em disco". **Ratificações
  humanas registradas (2026-07-20, via AskUserQuestion):** (1) o estoque do molde-salão é **invariante
  financeiro PERPÉTUO** ⇒ **perna A (subrazão Prisma first-class)**, com a instrução explícita de **escopar
  por reuso máximo**; (2) **F-INV1 → custo médio móvel** (não FIFO/lote); (3) **F-INV3 → seed manual + ponte
  de compra AP→estoque no MVP** (o dono escolheu incluir a compra agora, não só o seed). Ressalva de escopo
  (T1 — objetivo sob a letra): a **ponte contábil de compra reusa o AP mergeado** (`D 1.1.6 Estoques / C 2.1.2
  Fornecedores`); o **parser de NF-e = PRÓXIMO incremento, sequenciado logo APÓS o estoque** (§4, ADR próprio
  `ADR-INCR-NFE`) — não é diferido indefinidamente; é formato de documento (não o invariante do estoque) e
  *alimenta* a mesma costura de custo, então entra como incremento seguinte, não dentro deste MVP. Defaults de padrão (F-INV0/2/4/5/6/7)
  confirmados junto. **Nenhum bloqueador de DECISÃO restante.** NENHUM código escrito; nenhuma skill roteada.
- **Autores:** par `luminaris-orchestrator` (roteamento, ORCH-001) + `luminaris-accounting-architect` (parecer
  de domínio, ACC-0xx) + **council de desenho `plan-council`** (4 lentes reuse/boundary/invariant/minimal —
  board objetivo abaixo). Mesmo formato dos precedentes `ADR-INCR-AP` / `ADR-INCR-AR`.
- **Nó do master map:** §5 "Subrazões restantes (estoque, imobilizado, folha, fiscal)" — ⚫ diferido; §5.1
  Bloco B item 12. Este ADR abre **só o Estoque**; **Imobilizado é ADR próprio** (§4 deste doc). Não colide
  com §1 (T1–T12) nem §4 (rejeitadas) — verificação em §2.
- **Supersedes:** none · **Related:** `ADR-INCR-AP` / `ADR-INCR-AR` (padrão canônico de subrazão espelhado),
  `ADR-INCR-REVENUE-SPLIT` (o seam pós-commit + técnica de resíduo em centavos que o CMV reusa), `ADR-C01`
  (salon sales bridge — a ponte que ganha o mapper de CMV).

## TLDR (2 linhas)

Estoque entra como **subrazão Prisma first-class perpétuo** (`InventoryItem` + `StockMovement`, migração
aditiva) — a única perna que põe **qty-em-mãos E custo médio móvel sob garantia de banco** (`@@unique`/`Int`/
CAS in-tx), espelhando AP/AR. **Reuso máximo é a diretriz ratificada:** núcleo invariante em Prisma **+
disciplina bridge-only na integração** (CMV entra por um `SalonSaleCogsMapper` aditivo ao seam já provado),
**diferindo a superfície CRUD pública** enquanto o único driver vivo for a venda do salão. O produto segue em
DynamicTable (`saleItems` — nome/categoria não são invariante fiscal); só a **valoração** sobe para Prisma.

---

## 1. Contexto e objetivo

Dar ao tenant o subrazão de **estoque valorado**: registrar entrada de mercadoria a custo, baixar o estoque
na venda reconhecendo o **CMV (Custo da Mercadoria Vendida)** como fato gerador, e manter a **valoração
perpétua** (saldo-em-mãos × custo médio móvel) correta sob os mesmos invariantes (T1–T12). Fecha a lacuna
nomeada em §5.2 do `ADR-INCR-SPED-ECF`: hoje a venda de salão reconhece **receita** (`D 1.1.2 / C 3.1+3.3`)
mas **não baixa estoque nem lança CMV** — a margem bruta é invisível ao ledger.

**Classificação (STOP block do CLAUDE.md):** valoração perpétua de estoque = decremento **atômico** de saldo
+ custo médio/lote **exato em centavos** ⇒ **invariante financeiro** ⇒ **Prisma first-class**; NUNCA
DynamicTable (T3, master map §4). Confirmado por deliberação adversarial (plan-council, §3): as pernas que
deixavam a valoração em DynamicTable (B híbrido, C bridge-only) foram refutadas pela lente `boundary`
(AC-2.1-B2/B3/B5) e pela lente `invariant` (ACC-011/014 sem gate in-tx). Referência canônica =
`features/accounting` e, literalmente, os módulos AP/AR.

**A diretriz de reuso (ratificação humana 2026-07-20 — "perpétuo, mas julgue o reaproveitamento que já
temos"):** a perna A vence no *como*, mas a lente `minimal` refutou-a corretamente no *escopo* — construir o
subrazão máximo (CRUD público + registro 3-toques + allowlist) para um módulo ⚫ de demanda não-provada é o
alvo YAGNI. **Resolução:** manter o **núcleo invariante de A** e enxertar a **disciplina bridge-only de C** na
fatia de integração; **diferir** a superfície pública até haver demanda de gestão manual de estoque. Ver F-INV2.

**Escopo MVP (pós-ratificação 2026-07-20):** backend do subrazão de estoque valorado por **custo médio móvel**
(F-INV1), com **baixa de CMV pela venda do salão** via bridge pós-commit **e entrada de custo por (i) seed
manual + (ii) ponte de compra AP→estoque** (F-INV3 (a)+(b), reusando o AP mergeado). **FORA deste MVP:**
FIFO/lote, imobilizado+depreciação (§4), superfície CRUD pública de estoque (F-INV2, diferida), FE
(`FE-INCR-INVENTORY`, diferido). **Sequenciado logo a seguir (NÃO diferido):** o **parser de NF-e**
(`ADR-INCR-NFE`) — a compra entra pelo AP neste MVP; a NF-e pré-preenche a mesma `Payable`/entrada no
incremento seguinte (§4).

**Fronteira com o produto do salão (crítica):** o produto e os itens de venda **já vivem em DynamicTable**
(`saleItems`/SalesModule; item carrega `productId`/`quantity`/`unitPrice`), lidos pelo bridge **só via
repository** (§2.1 held: accounting→repo, nunca o inverso). Este ADR **não** move o produto para Prisma —
`InventoryItem` referencia o produto por **`productRef: String`** (F-INV5, espelha o `customerRef` do AR). O
que sobe para Prisma é **exclusivamente a valoração** (qty-em-mãos + custo médio + CMV), porque só ela é
invariante de dinheiro.

## 2. Evidência de código (CBM-001 — confirmado por leitura em `origin/main`)

| Claim | Grau | Evidência |
|---|---|---|
| **Não existe** model `Inventory`/`Stock`/`InventoryItem` — nenhum subrazão de estoque hoje (pré-ADR legítimo) | verificado | `grep -E "model (Inventory\|Stock\|InventoryItem)" schema.prisma` → 0; `git ls-tree origin/main docs/adr` sem ADR de estoque |
| O salão reconhece **receita** mas **não** baixa estoque/CMV — `salon.sale.finalized` faz `D 1.1.2 / C 3.1(+3.3)`; nenhum lançamento de custo | verificado | `sync/mappers/SalonSaleFinalizedMapper.ts:21,58-68` (só receita) |
| Itens de venda vivem em **DynamicTable**, lidos via repo; `loadSalePackageInfo` já computa subtotal por linha de `productId`/`quantity`/`unitPrice` | verificado | `sync/bridges/salonSaleItems.ts:45-80` (`repo.findTableByInternalName(userId,'saleItems')`) |
| Seam pós-commit reusável: `maybeSyncSalonSaleFinalized` posta via `postEntry`, idempotência pelo `@@unique` da JournalEntry, **sem pré-check** | verificado | `sync/bridges/SalonSalesAccountingBridge.ts:13,19,36` |
| `PostingService.postEntry` = fronteira única de escrita: gate de período preflight + autoritativo in-tx, balanceamento inteiro, idempotência `@@unique([userId,unitId,sourceType,sourceId])`, audit in-tx, seam INCR-8 | verificado | `schema.prisma:510` (`@@unique`); `services/PostingService.ts` |
| Chart fixture: Assets `1.1.1 Banco`/`1.1.2 A Receber`/`1.1.3 Caixa`/`1.1.4 A Receber Cartão`/`1.1.5 Clientes a Receber` — **próxima folha Asset livre = `1.1.6`**; único Expense = `4.1` ⇒ **`4.2` livre p/ CMV** | verificado | `fixtures/ChartOfAccountsFixture.ts:22-35` (a "1.1.3 Estoque" da formulação original do fork está **errada** — 1.1.3 é Caixa) |
| Conta nova no fixture = **zero migração** (seed idempotente cria-se-faltar por `code`; precedentes `2.1.2` AP, `1.1.5` AR) | verificado | `PostingService.ensureChartOfAccounts`; `ChartOfAccountsFixture.ts` (comentário AR :29-35) |
| Conta de controle DEDICADA com tie-out `Σ rows == saldo` = padrão ratificado (AR usa `1.1.5` distinta da `1.1.2` do salão justamente p/ o subledger bater com o razão) | verificado | `ChartOfAccountsFixture.ts:29-35`; `ADR-INCR-AR §D2/F7` |
| CAS-before-post atômico (`updateMany where … status/qty`, `count===1` vence) + reconcile re-drive = load-bearing da subrazão-posta-direto | verificado | `ADR-INCR-AP §D4`; `services/PayableService.ts` |
| `reverseEntry` = novo lançamento (ACC-018), não edição destrutiva; libera chave só p/ `sourceType='closing'` | verificado | `PostingService.ts` (key-freeing closing-only) |
| Técnica de resíduo em centavos (Σ preservado, sem centavo perdido) reusável p/ custo médio | verificado | `SalonSaleFinalizedMapper.ts:71-96` (`splitCredit`) |
| `MAX_CENTS` Int32 compartilhado, guardado nos write-surfaces; money em DynamicTable = **float JSON** no SQLite, `unique` de preset ≠ constraint de DB | verificado | `models/money.ts:14`; memória `dynamictable-money-and-uniqueness-limits` |
| BP/DRE absorvem contas novas **por natureza** (nature-only): `1.1.6` Asset e `4.2` Expense entram sem mudar statement-fixture (salvo mapeamento DRE explícito de CMV — D7) | verificado | `services/StatementMappingFixture.ts` |
| `saleItems.unitPrice` é preço de **VENDA**, não custo ⇒ a valoração precisa de fonte de custo de entrada própria (F-INV3) | verificado | `salonSaleItems.ts:66` (usa `unitPrice` como preço de linha de receita) |

**Colisões com decisões commitadas:** nenhuma — desde que (i) valoração em Prisma, nunca DynamicTable (§4, T3);
(ii) sem torre de cadastro de `Product` first-class (produto = `productRef`, §4); (iii) gate in-tx + SQLite
(T1/T6); (iv) CMV integra por **bridge pós-commit**, nunca serviço Prisma injetado no motor DynamicTable (§2.1).

## 3. Board do council (plan-council, 2026-07-20 — insumo do desenho, não ratificação)

Fork deliberado: *onde vivem qty-em-mãos + custo unitário*. Placar objetivo (por perna, quantas das 4 lentes
NÃO a refutaram):

| Perna | Lentes não-refutadas | avgRank | Veredito |
|---|---|---|---|
| **A — Prisma first-class** | **3/4** (reuse, boundary, invariant) | **1.25** | **recomendada** — única a satisfazer o invariante conjunto qty+custo sob garantia de banco |
| C — bridge-only (valoração na DT) | 1/4 (minimal) | 2.25 | refutada por boundary (AC-2.1-B2/B3), invariant (ACC-011/014 sem gate in-tx), reuse (ilha valoração-em-DT) |
| B — híbrido (qty na DT, valoração Prisma) | 0/4 | 2.50 | estritamente dominada: parte a quantidade autoritativa em dois donos e ainda deixa o saldo físico fora da tx |

**Divergência real** (contraste com a convergência do fork ECF read-only): as 3 lentes de domínio convergiram
em A; a lente `minimal` dissentiu e elegeu C no eixo **YAGNI/escopo** — resolvido pela diretriz de reuso
(F-INV2). A lente `boundary` **não** foi muda: refutou ativamente B e C. Enxertos aplicados ao desenho de A:
disciplina bridge-only de C (§D3), regra DRE explícita do CMV (D7), vigilância de duplo-decremento de B (§6).

## 4. As decisões fixadas (D1–D9 — espelho AP/AR onde marcado)

### D1 — Estoque = Prisma first-class: `InventoryItem` + `StockMovement` (filho 1:N), migração aditiva
`model InventoryItem` (`@@map("inventory_items")`): `userId` (FK User cascade; trilha imutável = AuditEvent,
T8), `unitId`, `productRef: String` (F-INV5 — ref DynamicTable, não FK), `description`, `qtyOnHand Int`
(quantidade em mãos, **inteiro** — unidades; fração de unidade fica FORA do MVP), `totalValueCents Int`
(valor total valorado — **a fonte-de-verdade do custo médio**, D6/ACC-014), `status` (`ACTIVE|ARCHIVED`),
`deletedAt`. `model StockMovement` (filho, o razão do estoque): `inventoryItemId` FK, `kind`
(`INBOUND|COGS|ADJUSTMENT|REVERSAL`), `qtyDelta Int` (sinalizado), `valueCentsDelta Int` (sinalizado),
`occurredAt`, `sourceType`/`sourceId` (casa o evento de origem), `entryId?` (o lançamento contábil quando há).
Índices `@@index([userId,unitId,status])`, `@@index([inventoryItemId,occurredAt])`. **Migração = `CREATE TABLE`
pura ×2, zero ALTER** (precedentes AP/AR).

**Custo médio móvel NÃO é coluna persistida** — é derivado `totalValueCents / qtyOnHand` **dentro da tx**,
nunca um `unitCostCents` float gravado (D6). O `StockMovement` é append-only; `qtyOnHand`/`totalValueCents` no
pai são o snapshot corrente, reconstruível pela soma dos movimentos (tie-out).

### D2 — Fato gerador do CMV = baixa na venda, via bridge pós-commit aditivo (F0 = rota (a), espelho AP/AR)
Na venda finalizada do salão, além da receita já existente, um **segundo mapper** reconhece o custo:
`D 4.2 CMV / C 1.1.6 Estoques` = `Σ (qty da linha × custo médio corrente do produto)`, com `sourceType=
'salon.sale.cogs'`, `sourceId=saleId`. Implementado como `SalonSaleCogsMapper` **ao lado** do
`SalonSaleFinalizedMapper`, plugado no mesmo seam pós-commit (`maybeSyncSalonSaleFinalized` ganha a segunda
emissão), reusando `loadSalePackageInfo` para as linhas. **O CMV posta DIRETO via `postEntry`** (rota (a) —
módulo interno ao mundo contábil, sem port/mapper especulativo), espelhando o F0 ratificado de AP/AR.

**Descartado:** computar CMV dentro do `SalesModule`/`DynamicTableService` (injetaria contábil no motor —
§2.1 anti-padrão); postar CMV do service de estoque direto (a origem é a venda; o seam pós-commit é o lugar).

### D3 — Custo de entrada = seed manual **+ ponte de compra AP→estoque** (F-INV3 → (b), ratificado)
O custo unitário de entrada **não** vem de `saleItems.unitPrice` (isso é preço de venda — §2 evidência). Duas
origens de `StockMovement kind='INBOUND'` no MVP, ambas recomputando o custo médio in-tx (D4):
1. **Seed manual** — comando explícito `receiveStock(productRef, qty, unitCostCents)`, para carga inicial e
   ajuste de custo; sem superfície CRUD pública (F-INV2 — chamado por seed/import operacional).
2. **Ponte de compra AP→estoque** (ratificada 2026-07-20) — uma `Payable` de **mercadoria para revenda**
   (não despesa) reconhece a compra como entrada valorada: `D 1.1.6 Estoques / C 2.1.2 Fornecedores a Pagar`
   (em vez do débito de despesa `4.x` do AP genérico), gerando o `StockMovement INBOUND` a custo. **Reusa o
   módulo AP já mergeado** (`Payable`/`PayableService`, PR #102) — a única adição é uma **classificação na
   `Payable`** ("é compra de estoque?" → `inventoryProductRef?`/`inventoryQty?`) que roteia o débito para
   `1.1.6` + emite o movimento de entrada, na **mesma tx** do post do AP. Sem port/motor novo — é o padrão de
   subrazão-posta-direto (F0 rota (a)).

**Ressalva de escopo (T1):** a ponte é **AP→estoque contábil**, não **NF-e→estoque**. O **parser de NF-e** (ler
o XML da nota, campo-a-campo) é subrazão FISCAL própria (`ADR-INCR-NFE`, ADR próprio) e é o **PRÓXIMO
incremento, sequenciado logo APÓS o estoque** (não diferido — re-priorização do dono 2026-07-20) — a compra
**deste MVP** entra pelo AP (fatura/duplicata manual do fornecedor), e a NF-e, no incremento seguinte, apenas
**pré-preencherá** a mesma `Payable`/entrada, sem bloquear o invariante de custo. **Enxerto da lente
`minimal` (mantido para a fatia não-ratificada):** ainda **nada de route/controller/policy/factory/registro-
3-toques de gestão manual de estoque** (F-INV2) até haver demanda de UI — a superfície pública de estoque
segue diferida; o que cresceu foi só a **origem de custo de entrada** (AP), por escolha do dono.

### D4 — Custo médio móvel: recompute atômico DENTRO da tx (ACC-011/012); TOCTOU do SKU concorrente
Toda entrada/baixa em `runTransaction` com `tx` propagado (T6). **Custo médio recomputado in-tx** na entrada:
`totalValueCents += inboundValue; qtyOnHand += inboundQty`. **Baixa (CMV):** custo médio corrente relido
**dentro da tx**; `valueDelta = round(totalValueCents × qtyBaixa / qtyOnHand)`; `qtyOnHand -= qtyBaixa;
totalValueCents -= valueDelta`. **TOCTOU de 2 vendas concorrentes no mesmo SKU:** guard atômico no banco antes
do post — `updateMany where inventoryItemId … AND qtyOnHand >= qtyBaixa` (CAS), `count===1` vence; a perdedora
falha explícito (estoque insuficiente), nunca saldo negativo silencioso. Padrão = o CAS-before-post canônico
do AP §D4 + reconcile re-drive (post idempotente). **Teste obrigatório: 2 baixas paralelas do mesmo SKU → 1
vence, 1 rejeita; saldo nunca negativo.**

### D5 — Centavos Int nativos + `MAX_CENTS`; SEM fronteira float na valoração
`totalValueCents`/`valueCentsDelta` = `Int`; DTO Zod `.strict()` guarda `Number.isSafeInteger && ≤ MAX_CENTS`
(import `accounting/models/money.ts`). A única fronteira float é a leitura do preço de venda no bridge (já
existente, já guardada no `SalonSaleFinalizedMapper`); a **valoração de estoque nasce em centavos**. **Espelha
D5 de AP/AR.**

### D6 — Custo médio derivado de `totalValueCents ÷ qtyOnHand` (nunca custo unitário float persistido)
A fonte-de-verdade é o par `(totalValueCents: Int, qtyOnHand: Int)`; o custo unitário é sempre derivado por
divmod dentro da tx, com **resíduo absorvido** (técnica do `splitCredit`, agora perpétua). **Risco NOVO
nomeado (D2 do parecer do council):** o custo médio vaza sub-centavo a cada baixa se derivado ingenuamente —
gate de review obrigatório (§7). Este é o **único ponto sem espelho mecânico de AP/AR**.

### D7 — CMV explícito no DRE (`dre.cogs`); tie-out de controle
Adicionar `4.2 CMV` ao `StatementMappingFixture` como linha de **CMV do DRE** (não somar silencioso às
despesas gerais — lição FAIL-1 do revenue-split, onde `3.3` sumia do DRE). Conta de controle **`1.1.6
Estoques`** com tie-out verificável `Σ InventoryItem.totalValueCents == saldo(1.1.6)` (espelho do `1.1.5`/AR).
BP mapeia `1.1.6` por natureza (Asset) automaticamente.

### D8 — Estorno = novo `StockMovement REVERSAL` (ACC-018); re-credita estoque
Cancelamento/devolução de venda re-credita o estoque: `StockMovement kind='REVERSAL'` (qtyDelta/valueDelta
invertidos, **ao custo médio do momento da baixa**, lido do movimento original — não ao custo médio corrente,
que pode ter mudado) + `reverseEntry` do lançamento de CMV. Nunca edição destrutiva. Idempotência: `sourceId`
do estorno = id do evento de estorno, nunca reuso da chave da baixa (classe do D5 da APURAÇÃO).

### D9 — Read-only? NÃO — é escrita; gate autoritativo in-tx; sem gate de período novo
A geração de movimento é **escrita** no ledger (CMV) + no subrazão (estoque). Herda o gate de período do
`postEntry` (o CMV é lançamento contábil comum). Não há gate de invariante novo além do CAS de saldo (D4).

## 5. Forks a RATIFICAR fork-a-fork (antes da implementação — via AskUserQuestion)

| Fork | Pernas | Recomendado | Grau de abertura |
|---|---|---|---|
| **F-INV0 — contas de controle** | (a) dedicadas `1.1.6 Estoques` + `4.2 CMV` · (b) reusar existentes | **(a)** — tie-out limpo, espelha AR `1.1.5` | baixo (padrão ratificado) |
| **F-INV1 — método de custeio** | (a) **custo médio móvel** · (b) FIFO/lote | ✅ **RATIFICADO → (a)** (2026-07-20) — mínimo que satisfaz o invariante; RFB/CPC aceitam média; FIFO fica como extensão própria se o setor exigir | fechado |
| **F-INV2 — superfície de integração** | (a) **bridge-only MVP** (models + comando entrada + mapper CMV; CRUD público diferido) · (b) subrazão CRUD completo agora | **(a)** — a resolução da diretriz de reuso; responde a lente `minimal` | ratificado no espírito (2026-07-20); confirmar |
| **F-INV3 — fonte do custo de entrada** | (a) seed manual `receiveStock` · (b) ponte de compra AP→estoque · (c) ler de `saleItems` | ✅ **RATIFICADO → (a)+(b)** (2026-07-20) — seed manual **e** ponte de compra AP no MVP; **(c) REJEITADA** (é preço de venda); **parser NF-e** = §4 próximo incremento (sequenciado) | fechado |
| **F-INV4 — rota de post do CMV** | (a) **postEntry direto via mapper no seam** · (b) port/bridge dedicado | **(a)** — espelho F0 AP/AR | baixo |
| **F-INV5 — identidade de produto** | (a) **`productRef: String`** (DT) · (b) `Product` Prisma first-class | **(a)** — nome/categoria não são invariante fiscal; espelho `customerRef`/AR F1 | baixo |
| **F-INV6 — estorno** | (a) **REVERSAL ao custo do movimento original** · (b) ao custo médio corrente | **(a)** — fiel; (b) distorce a margem | baixo |
| **F-INV7 — gatilhos de baixa** | (a) **só venda de salão (PDV)** no MVP · (b) baixas manuais também | **(a)** — o único driver vivo; baixa manual só saída não-PDV, diferida | baixo (mitiga duplo-decremento, §6) |

## 6. Sequenciamento e escopo diferido

**PRÓXIMO incremento — sequenciado logo APÓS o estoque (NÃO diferido; re-priorização do dono 2026-07-20):**
- **NF-e (`ADR-INCR-NFE`)** — parser do XML da nota fiscal (campo-a-campo, subrazão FISCAL própria). Abre
  assim que o estoque fechar (ADR próprio + fork-a-fork). Consome a costura já pronta: a NF-e de compra
  **pré-preenche a `Payable`/entrada** (a ponte AP→estoque deste MVP é o ancoradouro); a NF-e de venda pode
  cruzar com o CMV. **Não** entra no código deste MVP — é o incremento seguinte, não uma fase deste.

**Diferido (cada um ADR próprio, sem sequência fixada):**
- **Imobilizado + depreciação** — o outro lado da frente "Estoque/Imobilizado". Ativo fixo **não** tem
  representação DynamicTable hoje (menos tensão de fronteira), e a **depreciação** é fato gerador periódico
  próprio (schedule + método linear/acelerado) — invariante distinto do estoque. **ADR-INCR-FIXED-ASSETS
  separado**, não misturar neste incremento.
- **FIFO/lote** (F-INV1 perna b), **superfície CRUD pública / FE** (`FE-INCR-INVENTORY`), **inventário
  físico/contagem/ajuste com aprovação**, **fração de unidade** (qty decimal), **multi-depósito**.
- **Risco de duplo-decremento (nomeado):** baixa manual + bridge de CMV da mesma venda poderiam baixar em
  dobro. Mitigação (F-INV7 perna a): o **bridge é a única origem de CMV para venda de salão** (idempotente por
  `saleId`); baixas manuais só para saída não-PDV, e ficam diferidas.
- **Risco de duplo-ENTRADA (novo, com F-INV3 (b)):** a mesma compra entrando pela **ponte AP→estoque** E por
  **seed manual** valoraria em dobro. Mitigação: a `Payable` de mercadoria é a **única** origem INBOUND por
  compra (idempotente por `payableId` no `sourceId` do `StockMovement`); o seed manual é só para **carga
  inicial / ajuste**, nunca para uma compra que já tem `Payable`. O gate de review inclui: entrada por AP não
  duplica com seed do mesmo lote.

## 7. Residual honesto + riscos/vieses (nomeados)

- **[RISCO NOVO, não herdado — D6/D2 do council] Arredondamento do custo médio móvel.** Único ponto sem
  espelho mecânico de AP/AR. **Gate de review obrigatório:** teste de tie-out `Σ StockMovement.valueCentsDelta
  == totalValueCents == saldo(1.1.6)` sobre sequência longa de recebimentos+baixas com custos que **não**
  dividem exato. Fonte-de-verdade = `totalValueCents`(Int) ÷ `qtyOnHand`(Int); jamais custo unitário float
  persistido.
- **[PRÉ-REQ — F-INV3] Custo de entrada.** Sem um evento inbound-cost (seed manual no MVP), o custo médio não
  tem insumo; o CMV sairia zero/errado. O ADR fixa a origem (F-INV3 (a)); a implementação **não** pode assumir
  que `saleItems` traz custo.
- **[VIÉS — escopo] Molde-salão é dominado por serviços.** A revenda (`3.3`) é a fração menor do faturamento
  típico; a diretriz de reuso (F-INV2 (a)) existe justamente para não pagar o subrazão máximo por uma fração
  pequena. Se a demanda de estoque crescer (varejo puro), a superfície CRUD/FE reabre por incremento próprio —
  **sem** re-migração (o núcleo Prisma já é o destino perpétuo; foi por isso que a perna faseada-em-DT foi
  descartada — meia-medida vira re-valoração histórica float→Int).
- **[RESIDUAL humano]** ratificação fork-a-fork de §5 (F-INV1/F-INV3 são os reais); browser sign-off e
  smoke-migration-gate quando a implementação fechar (migração toca só `CREATE TABLE` novas — não `journal_
  entries` — mas roda o gate por disciplina).

## 8. Sinal humano — estado do gate

**Ratificado (2026-07-20, via AskUserQuestion — fork-a-fork COMPLETO):**
1. ✅ **Estoque é invariante financeiro PERPÉTUO** ⇒ perna **A** (subrazão Prisma first-class).
2. ✅ **Diretriz de reuso máximo** ⇒ núcleo A + disciplina bridge-only (F-INV2 (a)); superfície pública diferida.
3. ✅ **F-INV1 → custo médio móvel** (FIFO/lote = extensão própria futura).
4. ✅ **F-INV3 → seed manual + ponte de compra AP→estoque** no MVP; **parser de NF-e = próximo incremento
   sequenciado logo a seguir** (`ADR-INCR-NFE`, §6 — não diferido; re-priorização do dono 2026-07-20).
5. ✅ Defaults confirmados: F-INV0 (contas dedicadas 1.1.6/4.2), F-INV4 (postEntry direto), F-INV5 (`productRef`),
   F-INV6 (REVERSAL ao custo original), F-INV7 (baixa só por venda de salão no MVP).

**Bloqueadores de DECISÃO restantes: NENHUM.** **Nenhum bloqueador externo de dado** (diferente do ECF) — o
custo de entrada é comando/AP próprio, não dado de terceiro. **Próximo passo = PLAN de implementação**
(orquestrador → implementer), com os gates de review de §7 (tie-out do custo médio, duplo-decremento).

> **Processo (mesmo de AP/AR/DIM):** `ADR (este) → ratificação fork-a-fork → PLAN → impl → review independente
> (worktree separado) → smoke-migration-gate → PR → closeout (ORCH-007 promove o nó §5.1 item 12) → memória`.
> Nada implementado; nó permanece ⚫ até a implementação fechar.
>
> **Closeout inclui re-sequenciar o master map §5.1 (re-priorização do dono 2026-07-20):** promover o nó de
> Estoque (item 12) e **mover NF-e (item 11) de ⚫ diferido genérico para o PRÓXIMO incremento sequenciado
> logo após o estoque** (abrir `ADR-INCR-NFE` ao fechar este). NF-e deixa de ser "diferido sem ordem" e passa
> a ser a frente imediatamente seguinte.
