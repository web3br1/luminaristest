# Example: `TicketMedio` KPI — analytics-kpi-generator output

Exemplo concreto de saída gerada por `analytics-kpi-generator TicketMedio sales`.

> **Tipos e helpers reais do repositório** (verificados contra `server/src/features/analytics/`):
> - Context: `AnalyticsProcessorContext` (de `../../core`)
> - Processor: `AnalyticsProcessor` retornando `ChartDataPoint[]` (`{ name, value, previousValue? }`)
> - Template: `AnalyticsTemplate` (de `../../core/models`)
> - Money: `addMoney` de `../../utils/CurrencyUtils`
> - **Rows têm shape `{ id, data: { ...campos } }`** — acesso via `row.data[fieldName]`

---

## 1. Processor (`kpis/sales/TicketMedioKpiProcessor.ts`)

```typescript
import type { AnalyticsProcessor, ChartDataPoint } from '../../core';
import { DataSanitizer } from '../../utils/DataSanitizer';
import { getPeriodBoundaries } from '../../utils/DateUtils';
import { addMoney } from '../../utils/CurrencyUtils';

export const ticketMedioKpiProcessor: AnalyticsProcessor = async (
  context
): Promise<ChartDataPoint[]> => {
  const { rows, params, table } = context;

  // Field mappings via params — nunca hardcode nomes de campo
  const amountField = params.amountField || 'totalAmount';
  const dateField   = params.dateField   || 'date';
  const statusField = params.statusField;
  const excludeStatuses: string[] = params.excludeStatuses || [];

  // referenceDate para reprodutibilidade
  const now = params.referenceDate ? new Date(params.referenceDate) : new Date();
  const timeZone = params.timeZone || 'UTC';
  const datePreset = params.datePreset || 'last12Months';
  const { currentStart, currentEnd, prevStart, prevEnd } =
    getPeriodBoundaries(datePreset, now, timeZone);

  let currentTotal = 0, currentCount = 0;
  let prevTotal = 0, prevCount = 0;

  // Single-pass com suporte a streaming
  const stream = typeof context.streamRows === 'function'
    ? context.streamRows()
    : (async function* () { yield rows; })();

  for await (const batch of stream) {
    for (const row of batch) {
      const data = row.data;                          // shape real: { id, data: {...} }
      const amount = DataSanitizer.extractCurrency(data[amountField]);
      if (!Number.isFinite(amount) || amount <= 0) continue;

      if (statusField && excludeStatuses.includes(data[statusField])) continue;

      const raw = data[dateField];
      if (!raw) continue;
      const d = new Date(raw);
      if (Number.isNaN(d.getTime())) continue;

      if (d >= currentStart && d < currentEnd) {
        currentTotal = addMoney(currentTotal, amount);
        currentCount++;
      } else if (d >= prevStart && d < prevEnd) {
        prevTotal = addMoney(prevTotal, amount);
        prevCount++;
      }
    }
  }

  const value        = currentCount > 0 ? currentTotal / currentCount : 0;
  const previousValue = prevCount   > 0 ? prevTotal / prevCount       : undefined;

  return [
    {
      name: 'Ticket Médio',
      value,
      previousValue,           // undefined quando não há período anterior — NUNCA 0
      tableSource: (table as any)?.presetKey || params.tableId || 'sales',
    },
  ];
};
```

---

## 2. Template (`kpis/sales/TicketMedioKpiTemplate.ts`)

```typescript
import type { AnalyticsTemplate } from '../../core/models';
import { registerTemplate } from '../../core';

export const ticketMedioKpiTemplate: AnalyticsTemplate = {
  key: 'ticketMedioKpis',
  name: 'Ticket Médio',
  description: 'Valor médio por venda no período, com comparação ao período anterior.',
  processor: 'ticketMedioKpis',          // deve bater com a key do registerProcessor
  requiredFields: [
    {
      key: 'amountField',
      label: 'Campo de Valor da Venda',
      types: ['number'],                  // array (plural) — padrão real do repo
      description: 'Campo numérico com o valor total da venda.',
      required: true,
    },
    {
      key: 'dateField',
      label: 'Campo de Data da Venda',
      types: ['date'],
      description: 'Campo de data usado para definir os períodos.',
      required: true,
    },
  ],
  optionalFields: [
    {
      key: 'statusField',
      label: 'Campo de Status',
      types: ['select', 'string'],
      description: 'Status da venda para excluir canceladas/estornadas.',
      required: false,
    },
  ],
};

registerTemplate(ticketMedioKpiTemplate);  // auto-registra ao ser importado
```

---

## 3. Registro (`kpis/sales/index.ts`) — EDIT

O registro acontece no `index.ts` da **categoria** (não no top-level com objeto):

```typescript
import { registerProcessor } from '../../core';
import { ticketMedioKpiProcessor } from './TicketMedioKpiProcessor';

// Registra o processor pela key
registerProcessor('ticketMedioKpis', ticketMedioKpiProcessor);

// Importa o template (que se auto-registra via registerTemplate no próprio arquivo)
import './TicketMedioKpiTemplate';

// Re-exporta
export { ticketMedioKpiProcessor } from './TicketMedioKpiProcessor';
export { ticketMedioKpiTemplate } from './TicketMedioKpiTemplate';
```

O top-level `kpis/index.ts` só precisa garantir `import './sales';` (já existe se a categoria já era registrada).

---

## 4. Test (`kpis/sales/__tests__/TicketMedioKpiProcessor.test.ts`)

```typescript
import { ticketMedioKpiProcessor } from '../TicketMedioKpiProcessor';

describe('TicketMedioKpiProcessor (QA Gold Standard)', () => {
  const referenceDate = new Date('2026-02-01T12:00:00Z');

  // Rows no shape real: { id, data: {...} }
  const baseRows = [
    { id: '1', data: { valor: 'R$ 300,00', data: '2026-01-10T10:00:00Z', status: 'paid' } },
    { id: '2', data: { valor: 'R$ 100,00', data: '2026-01-20T10:00:00Z', status: 'paid' } },
    { id: '3', data: { valor: 'R$ 500,00', data: '2026-01-15T10:00:00Z', status: 'cancelled' } }, // excluído
  ];

  const baseContext: any = {
    rows: baseRows,
    params: {
      amountField: 'valor',
      dateField: 'data',
      statusField: 'status',
      excludeStatuses: ['cancelled'],
      referenceDate,
      timeZone: 'America/Sao_Paulo',
      datePreset: 'lastMonth',
    },
    fetchByPresetTableKey: async () => ({ rows: [] }),
  };

  describe('Math Suite', () => {
    it('calcula média excluindo status inválidos', async () => {
      const out = await ticketMedioKpiProcessor(baseContext);
      const kpi = out.find(p => p.name === 'Ticket Médio');
      expect(kpi?.value).toBeCloseTo(200, 2); // (300 + 100) / 2
    });
  });

  describe('Empty Safety Suite', () => {
    it('retorna 0 (não NaN) com rows vazios', async () => {
      const out = await ticketMedioKpiProcessor({ ...baseContext, rows: [] });
      const kpi = out.find(p => p.name === 'Ticket Médio');
      expect(Number.isFinite(kpi?.value ?? 0)).toBe(true);
      expect(kpi?.value).toBe(0);
    });
  });

  describe('Float Safety Suite', () => {
    it('100 vendas de R$0,10 → ticket médio R$0,10 exato', async () => {
      const rows = Array.from({ length: 100 }, (_, i) => ({
        id: String(i),
        data: { valor: 'R$ 0,10', data: '2026-01-10T10:00:00Z', status: 'paid' },
      }));
      const out = await ticketMedioKpiProcessor({ ...baseContext, rows });
      const kpi = out.find(p => p.name === 'Ticket Médio');
      expect(kpi?.value).toBeCloseTo(0.10, 2);
    });
  });
});
```
