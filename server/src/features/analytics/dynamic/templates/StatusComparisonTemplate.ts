/**
 * Status Comparison Template
 *
 * Compares values grouped by status.
 */

import type { AnalyticsTemplate } from '../../core/models';
import { registerTemplate } from '../../core';

export const statusComparisonTemplate: AnalyticsTemplate = {
  key: 'statusComparison',
  name: 'Comparação por Status',
  description:
    'Compara valores agrupados por status. Útil para comparar recebido vs pendente, aprovado vs rejeitado.',
  processor: 'statusComparison',
  requiredFields: [
    {
      key: 'amountField',
      label: 'Campo de Valor',
      types: ['number'],
      description: 'Campo numérico com o valor a ser somado',
      required: true,
    },
    {
      key: 'statusField',
      label: 'Campo de Status',
      types: ['select', 'string'],
      description: 'Campo que contém o status para agrupar',
      required: true,
    },
  ],
  optionalFields: [
    {
      key: 'excludeStatuses',
      label: 'Status a Excluir',
      types: [],
      description: 'Array de valores de status a excluir',
      required: false,
    },
    {
      key: 'statusGroups',
      label: 'Agrupamento de Status',
      types: [],
      description: 'Mapeamento de valores para nomes de grupo',
      required: false,
    },
    {
      key: 'labelMap',
      label: 'Mapeamento de Labels',
      types: [],
      description: 'Mapeamento de nomes para labels de exibição',
      required: false,
    },
  ],
  defaultOptions: { type: 'bar' },
  defaultParams: {},
};

registerTemplate(statusComparisonTemplate);

