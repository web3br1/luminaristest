---
name: analytics-kpi-generator
description: Gera KPI processor + template para o engine analítico do Luminaris, seguindo o padrão single-pass sobre rows com ChartDataPoint[]
argument-hint: "[NomeDoKpi] [categoria]"
allowed-tools: Read, Grep, Glob, Write, Edit
---

# Analytics KPI Generator

## Purpose

Gera `<Name>KpiProcessor.ts` e `<Name>KpiTemplate.ts` seguindo o contrato `AnalyticsProcessor` do Luminaris. O processor executa em single-pass sobre os dados para performance máxima, e o template registra os parâmetros configuráveis.

## When to use

- Novo KPI de negócio precisa ser calculado
- Adicionando variante de KPI existente (por categoria, por período)
- Criando processor dinâmico para `analytics/dynamic/`

## Inputs

- `$ARGUMENTS[0]`: nome do KPI em PascalCase (ex: `TicketMedioPorPeriodo`)
- `$ARGUMENTS[1]`: categoria (ex: `revenue`, `cost`, `sales`, `custom`)

## Repository patterns to inspect first

```
server/src/features/analytics/kpis/revenue/RevenueKpiProcessor.ts
server/src/features/analytics/kpis/revenue/RevenueKpiTemplate.ts
server/src/features/analytics/kpis/cashflow/CashflowKpiProcessor.ts
server/src/features/analytics/core/models/AnalyticsConfiguration.ts
server/src/features/analytics/utils/DateUtils.ts
server/src/features/analytics/utils/CurrencyUtils.ts
server/src/features/analytics/utils/DataSanitizer.ts
server/src/features/analytics/kpis/index.ts
```

## Generation contract

### Processor

1. Arquivo: `server/src/features/analytics/kpis/<category>/<Name>KpiProcessor.ts`
2. Tipo: `import type { AnalyticsProcessor, ChartDataPoint } from '../../core'`
3. Exportar: `export const <name>KpiProcessor: AnalyticsProcessor = async (context): Promise<ChartDataPoint[]> => { ... }`
4. Desestruturar: `const { rows, params, table } = context`
5. Field mappings via params: `const amountField = params.amountField || 'totalAmount'`
6. Stream ou array:
   ```ts
   const stream = typeof context.streamRows === 'function'
     ? context.streamRows()
     : (async function* () { yield rows; })()
   ```
7. Single-pass: `for await (const batch of stream) { for (const row of batch) { ... } }`
8. Usar helpers: `DataSanitizer.extractCurrency()`, `addMoney()`, `getPeriodBoundaries()`, `isDateWithinWindow()`
9. Retornar: `ChartDataPoint[]` com `{ name, value, previousValue?, recordIds, tableSource, fullRecords? }`
10. `tableSource`: `(table as any).presetKey || params.tableId || '<category>'`
11. `referenceDate`: `const now = params.referenceDate ? new Date(params.referenceDate) : new Date()`

### Template

1. Arquivo: `server/src/features/analytics/kpis/<category>/<Name>KpiTemplate.ts`
2. Tipo: `import type { AnalyticsTemplate } from '../../core/models'`
3. Campos: `key`, `name`, `description`, `processor` (string = key do `registerProcessor`), `requiredFields[]`, `optionalFields[]`
4. `requiredFields` usa `types: ['number']` (array, plural), `key`, `label`, `description`, `required`
5. No fim do arquivo, auto-registrar: `registerTemplate(<name>KpiTemplate)`

### Registro

1. No `index.ts` da **categoria** (`kpis/<category>/index.ts`):
   - `registerProcessor('<key>', <name>KpiProcessor)` (key = campo `processor` do template)
   - `import './<Name>KpiTemplate'` (o template se auto-registra via `registerTemplate`)
   - re-exportar processor e template
2. Garantir que `kpis/index.ts` (top-level) tem `import './<category>'` — se for uma categoria nova

### Teste

1. Arquivo: `server/src/features/analytics/kpis/<category>/__tests__/<Name>KpiProcessor.test.ts`
2. Mock rows com `data` object contendo os campos esperados
3. Verificar: valores calculados, período atual vs anterior, edge cases (0 rows, valores nulos)

## Files usually created or changed

```
server/src/features/analytics/kpis/<category>/<Name>KpiProcessor.ts              ← NEW
server/src/features/analytics/kpis/<category>/<Name>KpiTemplate.ts               ← NEW
server/src/features/analytics/kpis/<category>/__tests__/<Name>Processor.test.ts  ← NEW
server/src/features/analytics/kpis/index.ts                                       ← EDIT
```

## Required checks

```bash
cd server && npx tsc --noEmit
cd server && npx jest features/analytics/kpis/<category> --passWithNoTests
```

## Anti-patterns

- Nunca faça múltiplos passes sobre os dados — tudo em single-pass por performance
- Não use `new Date()` diretamente — use `params.referenceDate ? new Date(params.referenceDate) : new Date()`
- Não ignore valores nulos/NaN — sempre validar com `Number.isFinite()` antes de acumular
- Não esqueça períodos: current window + previous window para cálculo de `previousValue`
- Não hardcode nomes de campos — sempre via `params.<field> || 'defaultFieldName'`
