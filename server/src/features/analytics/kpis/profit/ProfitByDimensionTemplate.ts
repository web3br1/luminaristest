/**
 * Profit By Dimension Template
 *
 * Analyzes profit, cost, or margin by a specific dimension.
 */

import type { AnalyticsTemplate } from '../../core/models';
import { registerTemplate } from '../../core';

export const profitByDimensionTemplate: AnalyticsTemplate = {
  key: 'profitByDimension',
  name: 'Lucro por Dimensão',
  description:
    'Calcula lucro, custo ou margem por uma dimensão específica (cliente, campanha, canal, etc.).',
  processor: 'profitByDimension',
  requiredFields: [
    {
      key: 'dimensionField',
      label: 'Campo de Dimensão',
      types: ['string', 'select'],
      description: 'Campo para agrupar (ex: customerId, campaignId, channel).',
      required: true,
    },
  ],
  optionalFields: [
    {
      key: 'amountField',
      label: 'Campo de Valor',
      types: ['number'],
      description: 'Campo numérico que representa o valor da receita (ou use revenueAmountField).',
      required: false,
    },
    {
      key: 'revenueAmountField',
      label: 'Campo de Receita',
      types: ['number'],
      description: 'Alias para amountField - campo numérico que representa o valor da receita.',
      required: false,
    },
    {
      key: 'dateField',
      label: 'Campo de Data',
      types: ['date'],
      description: 'Campo de data para filtrar por período.',
      required: false,
    },
    {
      key: 'revenueDateField',
      label: 'Campo de Data (Revenue)',
      types: ['date'],
      description: 'Alias para dateField.',
      required: false,
    },
    {
      key: 'statusField',
      label: 'Campo de Status',
      types: ['select', 'string'],
      description: 'Campo de status para filtrar.',
      required: false,
    },
    {
      key: 'metricMode',
      label: 'Modo de Métrica',
      types: [],
      description: 'profit, cost, ou margin (padrão: profit).',
      required: false,
    },
  ],
  defaultOptions: {
    type: 'bar',
    layout: 'chart',
  },
  defaultParams: {
    period: 'month',
    metricMode: 'profit',
    excludeStatuses: ['Cancelled'],
  },
};

registerTemplate(profitByDimensionTemplate);

