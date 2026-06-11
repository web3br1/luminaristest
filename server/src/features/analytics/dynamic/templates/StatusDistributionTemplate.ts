/**
 * Status Distribution Template
 *
 * Counts occurrences of values in a select field.
 */

import type { AnalyticsTemplate } from '../../core/models';
import { registerTemplate } from '../../core';

export const statusDistributionTemplate: AnalyticsTemplate = {
  key: 'statusDistribution',
  name: 'Distribuição de Status',
  description:
    'Conta ocorrências de valores em um campo select. Útil para visualizar distribuição de status, estados, categorias.',
  processor: 'statusDistribution',
  requiredFields: [
    {
      key: 'statusField',
      label: 'Campo de Status',
      types: ['select'],
      description: 'Campo do tipo select com opções de status/estado/categoria',
      required: true,
    },
  ],
  optionalFields: [
    {
      key: 'hints',
      label: 'Dicas de Busca',
      types: [],
      description: 'Preferências para encontrar o campo automaticamente',
      required: false,
    },
  ],
  defaultOptions: { type: 'donut' },
  defaultParams: {
    hints: {
      preferFieldNames: ['status'],
      maxOptions: 10,
    },
  },
};

registerTemplate(statusDistributionTemplate);

