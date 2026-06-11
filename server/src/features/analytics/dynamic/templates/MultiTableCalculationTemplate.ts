/**
 * Multi-Table Calculation Template
 *
 * Combines data from multiple tables with custom formulas.
 */

import type { AnalyticsTemplate } from '../../core/models';
import { registerTemplate } from '../../core';

export const multiTableCalculationTemplate: AnalyticsTemplate = {
  key: 'multiTableCalculation',
  name: 'Cálculo Multi-Tabela',
  description:
    'Combina dados de múltiplas tabelas com fórmula customizada (ex: Vendas - Despesas).',
  processor: 'multiTableCalculation',
  requiredFields: [
    {
      key: 'tables',
      label: 'Tabelas',
      types: [],
      required: true,
      description:
        'Mapa de aliases para chaves de tabela (ex: { sales: "@@PRESET_TABLE_KEY::sales" })',
    },
    {
      key: 'formula',
      label: 'Fórmula',
      types: [],
      required: true,
      description: 'Expressão matemática usando aliases das tabelas (ex: "sales - expenses")',
    },
    {
      key: 'amountFields',
      label: 'Campos de Valor',
      types: [],
      required: true,
      description: 'Mapa de aliases para campos numéricos',
    },
  ],
  optionalFields: [
    {
      key: 'groupBy',
      label: 'Agrupar Por',
      types: [],
      description: 'period (padrão) ou status',
    },
    {
      key: 'period',
      label: 'Período',
      types: [],
      description: 'day, week, month (padrão), quarter, year',
    },
    {
      key: 'dateFields',
      label: 'Campos de Data',
      types: [],
      description: 'Mapa de aliases para campos de data',
    },
  ],
  defaultDisplayOptions: {
    chartType: 'line',
    currency: 'BRL',
    isTemporal: true,
  },
  examples: [
    {
      title: 'Lucro Líquido Mensal',
      params: {
        tables: {
          sales: '@@PRESET_TABLE_KEY::sales',
          expenses: '@@PRESET_TABLE_KEY::expenses',
        },
        formula: 'sales - expenses',
        groupBy: 'period',
        period: 'month',
        amountFields: { sales: 'totalAmount', expenses: 'amount' },
        dateFields: { sales: 'date', expenses: 'date' },
      },
    },
  ],
};

registerTemplate(multiTableCalculationTemplate);

