/**
 * Temporal Aggregation Template
 *
 * Aggregates values by time period.
 */

import type { AnalyticsTemplate } from '../../core/models';
import { registerTemplate } from '../../core';

export const temporalAggregationTemplate: AnalyticsTemplate = {
  key: 'temporalAggregation',
  name: 'Agregação Temporal',
  description:
    'Agrega valores por período de tempo (dia, semana, mês, trimestre, ano).',
  processor: 'temporalAggregation',
  requiredFields: [
    {
      key: 'amountField',
      label: 'Campo de Valor',
      types: ['number'],
      description: 'Campo numérico com o valor a ser somado',
      required: true,
    },
    {
      key: 'dateField',
      label: 'Campo de Data',
      types: ['date'],
      description: 'Campo de data para agrupar por período',
      required: true,
    },
  ],
  optionalFields: [
    {
      key: 'period',
      label: 'Período',
      types: [],
      description: 'day, week, month, quarter, year (padrão: month)',
      required: false,
    },
    {
      key: 'excludeStatuses',
      label: 'Status a Excluir',
      types: [],
      description: 'Array de valores de status a excluir',
      required: false,
    },
    {
      key: 'statusField',
      label: 'Campo de Status',
      types: ['select', 'string'],
      description: 'Campo de status para verificar exclusões',
      required: false,
    },
    {
      key: 'limit',
      label: 'Limite de Períodos',
      types: ['number'],
      description: 'Número máximo de períodos (padrão: 12)',
      required: false,
    },
  ],
  defaultOptions: { type: 'bar', isTemporal: true },
  defaultParams: { period: 'month', limit: 12 },
};

registerTemplate(temporalAggregationTemplate);

