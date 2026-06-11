# Área 2 — Motor de Analytics/KPI (Auditoria Profunda)

> Parte do relatório `auditoria_profunda_areas.md`. Gerado em 2026-06-11.

## 1. Registry de processadores

**Localização**: `server/src/features/analytics/core/ProcessorRegistry.ts`

Registro em memória centralizado (Registry pattern):

- Linha 80: `processorRegistry: Record<string, AnalyticsProcessor> = {}`
- Linhas 88-93: `registerProcessor(key, processor)` — registra, com aviso se sobrescrever
- Linhas 101-103: `getProcessor(key)` — retorna processador ou null
- Linhas 110-112: `getRegisteredProcessors()` — chaves registradas
- Linhas 120-122: `hasProcessor(key)`

**Fluxo de registro (implementado):**
1. Processadores KPI registrados em `server/src/features/analytics/kpis/[tipo]/index.ts`
2. Processadores dinâmicos em `server/src/features/analytics/dynamic/processors/index.ts`
3. Ambos importados via `AnalyticsResolver.ts:14-15`

**Resolução em runtime:** `AnalyticsResolver.ts:317-320` usa `getProcessor(chart.processor)`; o campo `processor` vem do `ChartPreset` (ex.: `"revenueKpis"`, `"aggregatePipeline"`).

## 2. Processadores individuais

### A. RevenueKpiProcessor — `'revenueKpis'`
**Arquivo**: `server/src/features/analytics/kpis/revenue/RevenueKpiProcessor.ts` (registro em `revenue/index.ts:11`)

**17 KPIs** (linhas 1-24): Receita Bruta, Líquida, Crescimento (%), Total Anual, Operacional/Não Operacional, Média Mensal / Dia Útil / Hora, por Cliente / Máxima por Cliente, por Categoria, Dependência de Fonte Única (%), Receita Nova (%) e Recorrente (%), Sazonal (índice), Atribuída a Campanhas.

**Entrada (params)**: `amountField` (padrão 'totalAmount'), `dateField` (padrão 'date'), opcionais `discountField`, `taxField`, `statusField`, `customerIdField`, `categoryField`, `revenueTypeField`, `isNewCustomerField`, `isLoyalCustomerField`; janela `monthsWindow` (padrão 12), `datePreset` (padrão 'thisMonth'); `timeZone` (padrão 'UTC'), `referenceDate`.

**Agregação passo a passo:**
1. Linhas 113-151: cria `historyMap` com 24 meses pré-zerados
2. Linhas 168-333: loop único com suporte a streaming:
   - Sanitiza valor com `DataSanitizer.extractCurrency()` (l.180)
   - Filtra status excluído (l.173-178, case-insensitive via `.toLowerCase()` l.175)
   - Verifica período com `isDateWithinWindow()` (l.188-189)
   - Acumula com `addMoney()` (l.195, 240, 245, 252, 260, 304-308, 320, 328)
   - Rastreia `recordIds` por métrica (l.106-110)
3. Linhas 335-500: derivados — divisão por zero protegida (l.340, 391, 481); heurística new/loyal (l.425-456); períodos vazios via `Math.max(1, monthsWithData)` (l.372-373)
4. Linhas 518-638: retorna 17 `ChartDataPoint` com `recordIds`, `tableSource`, `fullRecords`

**Filtro por userId**: NÃO neste nível — recebe rows já filtradas pelo `AnalyticsResolver.ts:336` (`getTableData(user, tableId)`).

### B. CostKpiProcessor — `'costKpis'`
`server/src/features/analytics/kpis/cost/CostKpiProcessor.ts` (registro `cost/index.ts:12`). 14 KPIs. Lógica análoga (loop único, `addMoney()` l.84,151). Filtros: status (padrão `['Cancelled']`), categorias Fixed/Variable/Administrative. Proteção de divisão: l.289 (`overallTotal / (businessDays || 1)`).

### C. ProductCostKpiProcessor — `'productCostKpis'`
`server/src/features/analytics/kpis/cost/ProductCostKpiProcessor.ts` (registro `cost/index.ts:13`). 4 KPIs (Custo Variável Total, Custo Médio, Margem, Custo por Venda). Multi-tabela via `fetchByPresetTableKey()` (`saleItems`, `stockMovements`). Lógica l.15-213: WAC via stockMovements (l.49-96); resolve datas de venda via header (l.113-166); custo variável `unitCost × quantity` (l.142); proteção zero l.177.

### D. ProfitKpiProcessor — `'profitKpis'`
`server/src/features/analytics/kpis/profit/ProfitKpiProcessor.ts` (registro `profit/index.ts:12`). 18 KPIs (Lucro Bruto/Operacional/Líquido, margens, rentabilidade). Filtros `requireFinalized`/`requirePaid` (default true). Debug tracking l.108-130.

### E. ProfitByDimensionProcessor — `'profitByDimension'`
`server/src/features/analytics/kpis/profit/ProfitByDimensionProcessor.ts` (registro `profit/index.ts:13`). Agrega lucro por dimensão (cliente, produto, categoria).

### F. SalesProfitByProductProcessor — `'salesProfitByProductOverTime'`
`server/src/features/analytics/kpis/sales/SalesProfitByProductProcessor.ts` (registro `sales/index.ts:11`). Lógica l.26-150+:
1. 12 meses de `historyMap` zerados (l.68-75)
2. Headers opcionais (l.81-88) para data + payment status
3. Stock movements (l.94-128): só "In"; WAC por produto `total_cost / total_qty`; flag `stockCostIsTotal`
4. Loop em saleItems: profit = `(unitPrice × qty) − (avgCost × qty)`, acumulado com `addMoney()` (l.113-115)
Proteções: l.110 (`c < 0 continue`), l.121 (`qty > 0`).

### G. CashflowKpiProcessor — `'cashflowKpis'`
`server/src/features/analytics/kpis/cashflow/CashflowKpiProcessor.ts` (registro `cashflow/index.ts:11`). 11 KPIs (Fluxo de Caixa, Contas a Receber/Pagar, índices de liquidez/solvência).

### H. AggregatePipelineProcessor — `'aggregatePipeline'`
`server/src/features/analytics/dynamic/processors/AggregatePipelineProcessor.ts` (registro `dynamic/processors/index.ts:19`). Pipeline declarativa, lógica l.174-429:
1. Fetch source (l.188-225): `presetTable` ou `tableId`, fallback para context rows
2. Relation lookups (l.228-269)
3. Joins/denormalização (l.271-302)
4. Filtros (l.305): eq, ne, in, nin, gt, gte, lt, lte
5. Agrupamento por dimensões field/period (l.307-313)
6. Medidas (l.316-349): `sum`, `count`, `avg` (proteção l.344-346), `formula` via `evaluateExpression()` (l.157-164)
7. Label resolution (l.352-382) e label map injection com value=0 (l.401-415)

### I. MultiTableCalculationProcessor — `'multiTableCalculation'`
`server/src/features/analytics/dynamic/processors/MultiTableCalculationProcessor.ts` (registro `dynamic/processors/index.ts:24`). Lógica l.48-192: busca múltiplas tabelas, agrega por período/status, avalia fórmula (l.162), retorna `tableSource='mixed'`.

### Demais dynamic processors (registro l.19-24 de `dynamic/processors/index.ts`)
`'statusDistribution'`, `'statusComparison'`, `'temporalAggregation'`, `'formulaCalculation'`.

## 3. Cents-safe math

`server/src/features/analytics/utils/CurrencyUtils.ts:6-8`:

```typescript
export function addMoney(a: number, b: number): number {
  return (Math.round(a * 100) + Math.round(Number(b || 0) * 100)) / 100;
}
```

Usado em todos os acúmulos monetários dos processors (ver linhas citadas acima). Teste de precisão: `KpiEngine.spec.ts:6-44` — 15.000 × 9.99 = 149850.00 exato em < 500ms.

## 4. Timezone handling

`server/src/features/analytics/utils/DateUtils.ts`:
- `createZonedDate(...)` (l.9-24) — via `date-fns-tz`
- `getZonedParts(date, tz)` (l.26-45) — `formatInTimeZone`
- `countBusinessDaysInMonth` (l.53-66) — protegido `return count || 1`
- `getStartDateForMonthsWindow` (l.71-82) — `setDate(1)` antes de `setMonth()` (evita overflow de fevereiro)
- `isDateWithinWindow` (l.87-90)
- `getZonedPeriodKey` (l.102-126) — chaves YYYY-MM / YYYY-MM-DD / YYYY-Wxx / YYYY-Qx no fuso do usuário
- `getPeriodBoundaries(preset, baseDate, tz)` (l.137-257) — presets today/thisWeek/thisMonth/lastMonth/last30Days/thisYear; `shiftMonth()` l.149-161

Teste de relatividade: `KpiEngine.spec.ts:47-98` — `2026-04-01T02:55Z` é março no fuso do Brasil (incluído em lastMonth) e abril em Londres (excluído).

## 5. Streaming / resultados parciais

- Processor: `RevenueKpiProcessor.ts:162-165` — usa `context.streamRows()` se função, senão generator-fallback que entrega o array completo; loop `for await` (l.168)
- Resolver: `AnalyticsResolver.ts:369-376` — `getTableStream()` via `service.getTableDataStream()`; fallback `getTableData()` (l.336, 381-384)
- `fullRecords` só incluído se dataset < 200 registros ou < 500KB (`AnalyticsResolver.ts:174-180`); `recordIds` sempre, para lazy-load via `resolveChartDetails()`

## 6. Fonte dos dados e filtro por userId

- `analyticsController.ts:9-13` — userId via `getUserContextFromRequest()`; l.23 valida autenticação antes de resolver
- `AnalyticsService.getAllPresetGroupsAsync(userId, ...)` (l.64-174): l.69 `getTablesForUser(userId)`; l.201-227 inclui só tabelas do usuário
- `resolveChartData` (AnalyticsResolver.ts:304-453): l.323 `getTablesForUser(user.id)`, l.336 `getTableData(user, tableId)`
- `resolveChartDetails` (l.459-857): l.503 e l.732 idem

O processor em si não filtra por userId — confia nas rows já escopadas (implementado, design consistente).

## 7. Definição/configuração de KPIs

- **AnalyticsConfiguration** (`core/models/AnalyticsConfiguration.ts`): `templateKey`, `key`, `title`, `fieldMapping`, `tableKey` (ex.: `@@PRESET_TABLE_KEY::sales`), `type`, `options`
- **TemplateRegistry** (`core/TemplateRegistry.ts`): `RevenueKpiTemplate.ts:216`, `CostKpiTemplate.ts:181,268`, `ProfitKpiTemplate.ts:194`, `CashflowKpiTemplate.ts:172`
- **Presets**: módulos definem `analytics: [...]` (ex.: `presets/modules/finance/SalesModule.ts`)
- **Banco**: `analyticsDefinitions` (escopo global/preset/table; filtro `published === false` em `AnalyticsService.ts:106`) — controller `analyticsDefinitionsController.ts` (inferência parcial)
- **Descoberta automática**: `discoverKPIsAsync(userId, tableId)` (`AnalyticsService.ts:405-547`) — analisa schema e sugere KPIs

## 8. Testes

| Arquivo | Cobre | Não cobre |
|---|---|---|
| `engine/__tests__/KpiEngine.spec.ts` | Precisão decimal, isolamento de timezone, performance | Streaming, multi-table joins |
| `kpis/revenue/__tests__/RevenueKpiProcessor.test.ts` | Receita bruta/líquida/crescimento/por cliente, exclusão de status, parsing R$ pt-BR | Streaming, edge cases de timezone, heurística new/loyal |
| `kpis/profit/__tests__/ProfitKpiProcessor.test.ts` | Profit KPIs | — |
| `kpis/cost/__tests__/CostKpiProcessor.test.ts` | Cost KPIs | — |
| `kpis/sales/__tests__/SalesProfitByProductProcessor.test.ts` | WAC, agregação por período | Header joins, edge cases de stock movement |

**Sem testes**: AggregatePipelineProcessor, CashflowKpiProcessor, ProfitByDimensionProcessor, MultiTableCalculationProcessor, statusDistribution/statusComparison/temporalAggregation/formulaCalculation, streaming/batching, relation resolution (AggregatePipelineProcessor.ts:228-269), label map injection (l.401-415), edge cases (dados vazios, datas nulas, refs de campo inválidas).

## 9. Riscos identificados (KPI-1 a KPI-10)

| # | Severidade | Risco | Evidência |
|---|---|---|---|
| KPI-1 | Média | Heurística new/loyal usa contagem só do período atual — cliente antigo com 1 venda no período é marcado "novo" | RevenueKpiProcessor.ts:425-456 (l.431-445) |
| KPI-2 | Baixa | Divisão por zero majoritariamente protegida, mas `cost / qty` sem check visível | SalesProfitByProductProcessor.ts:121 |
| KPI-3 | Info | `fullRecords` omitido em datasets grandes — front deve usar `resolveChartDetails` (by design) | AnalyticsResolver.ts:174-180 |
| KPI-4 | **Alta** | Falha silenciosa em fetch multi-tabela: `catch { headerById = null }` → métrica calculada com data fallback incorreta, sem aviso | ProductCostKpiProcessor.ts:104-110; SalesProfitByProductProcessor.ts:85-87 |
| KPI-5 | OK | Status case-sensitive já corrigido (toLowerCase) | RevenueKpiProcessor.ts:175 |
| KPI-6 | Baixa | Label map injection insere categorias com value=0 mesmo sem dados (pode confundir) | AggregatePipelineProcessor.ts:401-415 |
| KPI-7 | Baixa | Timezone inválido falha de modo capturado/loggado, sem validação de entrada IANA | DateUtils.ts:9-24, 40-44 |
| KPI-8 | Info | Fallback de streaming carrega tudo em memória (otimização ausente, não bug) | RevenueKpiProcessor.ts:162-165 |
| KPI-9 | Média | "Smart fallback" resolve campos `*Id` como relação mesmo quando não são; erro engolido em catch | AnalyticsResolver.ts:84-98, 136 |
| KPI-10 | Média | Valores ≤ 0 silenciosamente excluídos da receita (design para refunds em tabela separada, mas pode enganar) | RevenueKpiProcessor.ts:181 (decisão l.25-32) |
