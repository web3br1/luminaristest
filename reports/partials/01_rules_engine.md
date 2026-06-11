# Área 1 — Rules Engine (Auditoria Profunda)

> Parte do relatório `auditoria_profunda_areas.md`. Gerado em 2026-06-11.

## Sumário

Rules Engine plugin-based com **10 plugins** registrados em `RuleRegistry`, invocado nas operações CRUD em 6 fases de lifecycle (beforeCreate, afterCreate, beforeUpdate, afterUpdate, beforeDelete, afterDelete).

- **Despachador**: `RuleRegistry.getApplicable(ctx)` filtra por `supports()` e executa **sequencialmente com await**
- **Invocação**: `DynamicTableService.runRules(ctx, phase)` — chamado nas linhas 394, 398, 554, 558, 634, 642
- **Matching de tabela**: `tableMatches()` + `resolveTable()` em `rules/shared/tableFinder.ts` — query indexada por internalName com fallback heurístico

## 1. RuleRegistry

**Arquivo**: `server/src/features/dynamicTables/rules/RuleRegistry.ts`

- Linhas 21-36: classe — `register()` acumula sem dedup; `getApplicable()` filtra por `supports(ctx)` com try/catch (erro em supports → tratado como false)
- Dispatch (`DynamicTableService.ts:681-689`): loop `for` sequencial, `await fn.call(p, ctx)` por plugin; **falha propaga** (não engole)
- Ordem determinística pela ordem de registro (l.39-53): Appointments → Sales → ProductAutoStock → UnitAutoStock → StockMovementsApply → Employees → Leads → LeadsSeedOnUnit → Commissions → Goals
- Mutações de `ctx.after` em before* são persistidas (`DynamicTableService.ts:556` extrai `persistedData`)
- **Sem rollback**: falha em after* deixa dado já gravado

## 2. AppointmentsPlugin

**Arquivo**: `rules/plugins/AppointmentsPlugin.ts` — tabela `appointments` (category planning). Hooks: beforeCreate (l.23), beforeUpdate (l.24-26). Sem side-effects (só validação).

`validateAppointment` (l.33-78):
1. Datas (l.34-48): `startAt`/`endAt` obrigatórios e ISO; `startAt >= now` (bypass `ctx.isSystem`); máx. now+5 anos → ValidationError
2. Cliente (l.50-62): `customerId` OU (`simpleCustomer` + `simpleCustomerName`)
3. Duração de serviço opcional (l.65-70 → l.83-91): compara duração ±5min vs campo `duration` do serviço; **não bloqueia** (só log)
4. Horário de trabalho (l.75-77 → l.96-114): valida `workSchedule[weekday].start/end` do Employee → ValidationError se fora

`validateCompletionTiming` (l.125-136): status → 'Completed' exige `endAt <= now` (bypass isSystem).

**Riscos**: (a) l.84 `findTableByName()` chamado com parâmetros incompatíveis — validação de duração pode falhar silenciosamente; (b) l.102 `getDay()` usa weekday local — mismatch potencial de timezone.

## 3. SalesPlugin (o mais complexo)

**Arquivo**: `rules/plugins/SalesPlugin.ts` (~350 linhas) + módulos `sales/saleItems.ts`, `sales/stockSync.ts`, `sales/appointmentSync.ts`, `sales/commissions.ts`, `sales/customerMetrics.ts`, `sales/shared.ts`. Tabelas: `sales` e `saleItems`. Todos os 6 hooks implementados.

### beforeCreate (l.183-271)
**Sales header**: `unitId` obrigatório (l.189-192); auto-fill `date` (l.195-196); cálculo `dueDate = date + paymentTermDays` (l.199-205).
**Sale items**: guard venda não-finalizada (l.211); XOR produto/serviço + `quantity > 0` (l.212 → saleItems.ts:105-119); proibição de mix Product+Service (l.214 → saleItems.ts:125-142, bypass isSystem); serviços com `requiresAppointment` → `autoCreateAppointmentForServiceItem()` cria agendamento e grava `appointmentId` (l.221-243); produtos → `ensureReservationAvailability()` valida `stock − reserved >= qty` (l.245-270 → stockSync.ts:81-95). **Cleanup**: falha no primeiro item → `deleteSaleIfFirstItem()` remove a venda órfã (l.238-241, 266-269).

### beforeUpdate (l.69-181)
**Items**: mesmo fluxo + coerência serviço/agendamento (l.74-82).
**Header** (l.85-181): pagamento 'Paid' auto-finaliza (l.96); bloqueia transição quando pago exceto Finalized; bloqueia regressão de Finalized (exceto Cancelled/Returned); bloqueia cancelar venda paga; recalcula dueDate (l.122-132). Ao finalizar (l.134-181): exige itens não-vazios, `discount <= subtotal`, cliente válido, agendamentos prontos (`assertServiceAppointmentsReady`, l.165), estoque suficiente por produto (l.169-180).

### afterCreate (l.273-278) / afterUpdate items (l.298+)
`adjustReservationForItemChange()` (stockSync.ts:28-78): delta de reserva em Product Units (`reserved ± qty`).

### afterUpdate header (l.304-348)
1. Recomputa `subtotal`/`totalAmount` via `loadSaleItems()` + `updateData()` (l.307-325)
2. `applyCustomerRevenueSideEffects()` → atualiza métricas do cliente (l.322-323)
3. Finalized (l.331-337): `processSaleStockUpdate()` + `createMovementsForItems()` ('Out') + `materializeCommissions()`
4. Cancelled/Returned (l.339-347): reverte estoque, movimentos 'In', cancela agendamentos Scheduled, cancela comissões

### beforeDelete (l.292-296) / afterDelete (l.280-290)
Guard não-finalizada; reverte reserva; cancela agendamento vinculado se Scheduled.

**Side-effects**: Product Units (stock/reserved), Stock Movements, Appointments, Commissions, Customers; mutações em ctx.after (date, dueDate, status, appointmentId, subtotal, totalAmount).

**Riscos críticos**:
- l.211-213: `loadSaleItems()` com fallback heurístico (saleItems.ts:69-88) — se tabela custom sem campo `saleId`, retorna `[]` e venda finaliza sem itens
- l.256-269: `deleteSaleIfFirstItem()` pode contar itens de tabela errada → venda órfã não limpa ou venda com itens deletada
- l.337: finalização executa 3 escritas (estoque+movimento+comissão) **sem transação** — falha no meio deixa estado parcial
- cleanup que falha gera apenas `logger.warn` (l.268)

## 4. ProductAutoStockPlugin

`rules/plugins/ProductAutoStockPlugin.ts` — tabela `products`, hook afterCreate (l.23-49). Ao criar produto: resolve tabelas Product Units e Units (l.27-43, retorno silencioso se ausentes); carrega TODAS as unidades (`findDataByTableId`, l.44) e cria 1 linha de estoque `{productId, unitId, stock: 0}` por unidade (N CREATEs sem batch).

**Riscos**: (a) full load de unidades — performance; (b) **sem idempotência** — re-execução cria duplicatas de estoque.

## 5. UnitAutoStockPlugin

`rules/plugins/UnitAutoStockPlugin.ts` — tabela `units`, hook afterCreate (l.22-62). Ao criar unidade: carrega todos os produtos + estoque existente (Promise.all, l.47-50); **idempotente** — verifica existência via `hasRow()` antes de criar (l.52-60); cria `{productId, unitId, stock: 0, reserved: 0}` por produto faltante.

**Risco**: full load de produtos em memória (l.48).

## 6. StockMovementsApplyPlugin

`rules/plugins/StockMovementsApplyPlugin.ts` — tabela `stockMovements`. Hooks: beforeCreate (l.28-86), beforeUpdate (l.87-119), beforeDelete (l.121-137).

- beforeCreate: valida productId/unitId/type In|Out/qty>0 (l.30-38); **pula movimentos `sourceType='SALE'`** (l.41-43, tratados pelo SalesPlugin); compras exigem supplierId + cost>0, auto-set paymentStatus='Pending' (l.46-67); resolve product unit via `findProductUnit()` (l.143-156); valida `newStock >= 0`; **aplica o delta de estoque via `updateData()` ANTES de gravar o movimento** (l.84-85)
- beforeUpdate: reverte efeito antigo + aplica novo (l.102-105)
- beforeDelete: reverte delta (l.132-134)

**Riscos**: (a) l.75-76 cost inválido normalizado para 0 silenciosamente; (b) l.85 estoque mutado em beforeCreate — se o INSERT do movimento falhar depois, estoque fica alterado sem movimento (estado parcial); (c) l.153 `findRowsByFieldValue` com LIMIT 100 só por productId — >100 linhas pode casar unitId errado.

## 7. EmployeesPlugin

`rules/plugins/EmployeesPlugin.ts` — tabela `employees`. Hooks beforeCreate/beforeUpdate (l.81-82). `validateEmployee` (l.31-70): exige `unitId` OU `workSchedule` com ≥1 dia válido; email obrigatório; cada dia com par start/end e `end > start`. Sem side-effects; sem riscos relevantes.

## 8. LeadsPlugin

`rules/plugins/LeadsPlugin.ts` (~408 linhas) — tabelas `leads`, `leadProposals`, `leadActivities`. Hooks: beforeCreate (l.87-119), beforeUpdate (l.121-193), afterCreate (l.194-205), afterUpdate (l.207-252).

- **Leads beforeCreate**: `validateLead()` (l.263-313) — unitId obrigatório, pipeline∈unit, stage∈pipeline, ranges (probability 0-100, BANT Low/Medium/High); **score BANT** `calcScore()` (l.43-72): Budget/Authority/Need Low=30/Medium=60/High=100, Timing Long=20/Medium=40/Short=70/Urgent=100, média → [0,100]; auto-fill pipeline/stage default (l.100-115 → `findFirstStageForPipeline` l.387-393, `findDefaultPipelineForUnit` l.399-405)
- **Proposals**: `validateProposal()` (l.318-330) — amount≥0, winProbability 0-100, estimatedCloseDate não-passado
- **Leads beforeUpdate**: transições de stage (l.135-188) — carrega stages da pipeline ordenados por `order`; só avançar 1 ou recuar 1 de 'meeting'; avanço p/ 'meeting' exige `nextActionAt` futuro; p/ 'proposal' exige latestProposal*
- **afterCreate/afterUpdate**: cria Lead Activities (`addActivity` l.357-365); proposals → `upsertLatestProposalSnapshot()` (l.335-351) copia última proposta para campos da Lead; activities call/email/meeting → seta `lastContactAt` (l.372-381); mudança de stage → activity 'stage_change'; regressão de meeting → 'meeting_no_show' + limpa nextActionAt (l.239)

**Riscos**: (a) l.146 stages limitados a 100 pelo `findRowsByFieldValue`; (b) l.341 ordem de propostas indeterminada no mesmo ms; (c) l.267 `addActivity` pós-gravação sem rollback — auditoria incompleta em falha.

## 9. LeadsSeedOnUnitPlugin

`rules/plugins/LeadsSeedOnUnitPlugin.ts` — tabela `units`, afterCreate (l.57-61). Cria "Pipeline Padrão" (isDefault=true) + 4 stages (Sem Contato/Reunião Agendada/Proposta Enviada/Fechamento, l.26-48). **Idempotente** (l.23-24: pula se unit já tem pipeline). Sem riscos relevantes.

## 10. CommissionsPlugin

`rules/plugins/CommissionsPlugin.ts` — tabela `commissions`, beforeCreate/beforeUpdate (l.34-38). `autoStampPaidAt` (l.17-23): transição para 'Paid' → auto-preenche `paidAt = now()`. Sem riscos.

## 11. GoalsPlugin

`rules/plugins/GoalsPlugin.ts` — tabela `goals`, beforeCreate/beforeUpdate (l.45,48). `autoComputeResult` (l.15-34): `progress = actual/target × 100` → Reached (≥100), Partial (≥50), Not Reached (<50 e endDate < now). **Risco baixo** (l.29): comparação de endDate usa timezone local do servidor.

## 12. Invocação no DynamicTableService

| Operação | Fase | Linha |
|---|---|---|
| createTableData | beforeCreate | 394 |
| createTableData | afterCreate | 398 |
| updateTableData | beforeUpdate | 554 |
| updateTableData | afterUpdate | 558 |
| deleteTableData | beforeDelete | 634 |
| deleteTableData | afterDelete | 642 |

`validatedData` em beforeCreate é mutável (plugins escrevem em `ctx.after` antes do INSERT); after* recebem `afterWithId`; afterUpdate extrai `persistedData` sem o id sintético (l.556).

**Mutações persistidas por plugin**: SalesPlugin (date, dueDate, status, appointmentId, subtotal, totalAmount); LeadsPlugin (score, stageId, nextActionAt, latestProposal*); CommissionsPlugin (paidAt); GoalsPlugin (result).

## 13. Tabela de riscos do Rules Engine (RE-1 a RE-16)

| # | Plugin | Linha | Sev. | Risco |
|---|---|---|---|---|
| RE-1 | Appointments | 84 | Média | findTableByName() com assinatura incompatível — validação de duração silenciosa |
| RE-2 | Sales | 211-213 | **Alta** | loadSaleItems() fallback pode retornar vazio — venda finaliza sem itens |
| RE-3 | Sales | 256-269 | **Alta** | deleteSaleIfFirstItem() pode contar tabela errada |
| RE-4 | Sales | 303-306 | Baixa | ctx.after.id residual após update |
| RE-5 | Sales | 337 | **Alta** | Estoque+movimento+comissão sem transação — estado parcial |
| RE-6 | Sales/stockSync | 47-49 | Média | findRowsByFieldValue LIMIT 100 — >100 produtos sem estoque provisionado |
| RE-7 | ProductAutoStock | 44 | Média | Full load de unidades |
| RE-8 | ProductAutoStock | — | **Alta** | Sem idempotência — rerun duplica estoque |
| RE-9 | UnitAutoStock | 48 | Média | Full load de produtos |
| RE-10 | StockMovements | 75-76 | Média | cost normalizado p/ 0 silenciosamente |
| RE-11 | StockMovements | 85 | **Alta** | updateData de estoque antes do create do movimento — estado parcial |
| RE-12 | StockMovements | 153 | Média | LIMIT 100 — match de unitId errado |
| RE-13 | Leads | 146 | Média | LIMIT 100 em stages — validação de transição incorreta |
| RE-14 | Leads | 341 | Baixa | Ordem indeterminada de propostas no mesmo ms |
| RE-15 | Leads | 267 | Média | addActivity falha pós-gravação — auditoria incompleta |
| RE-16 | Goals | 29 | Baixa | Timezone local em endDate |

## 14. Pontos fortes

1. Plugin pattern com interface estável (`RulePlugin`)
2. Execução sequencial com await — determinismo
3. Computed fields via mutação de ctx.after (score, result, paidAt)
4. Documentação em `rules-engine.md`

## 15. Recomendações

1. Envolver finalização de venda (estoque/movimento/comissão) em transação ou saga
2. Testes para `loadSaleItems()` com tabelas custom
3. `findRowsByFieldValue` com paginação real para casos >100
4. Check de dedup em ProductAutoStockPlugin
