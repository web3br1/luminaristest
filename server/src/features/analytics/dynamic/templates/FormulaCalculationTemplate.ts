/**
 * Formula Calculation Template
 *
 * Calculates values based on a formula with mapped variables.
 */

import type { AnalyticsTemplate } from '../../core/models';
import { registerTemplate } from '../../core';

export const formulaCalculationTemplate: AnalyticsTemplate = {
  key: 'formulaCalculation',
  name: 'Cálculo por Fórmula',
  description:
    'Calcula valores com base em uma fórmula (ex.: receita - desconto - impostos).',
  processor: 'formulaCalculation',
  requiredFields: [],
  optionalFields: [
    {
      key: 'dateField',
      label: 'Campo de Data',
      types: ['date'],
      description: 'Campo de data para agrupamento por período',
      required: false,
    },
    {
      key: 'statusField',
      label: 'Campo de Status',
      types: ['select', 'string'],
      description: 'Campo de status para agrupamento',
      required: false,
    },
  ],
  defaultOptions: { type: 'bar' },
  defaultParams: { groupBy: 'none' },
};

registerTemplate(formulaCalculationTemplate);

