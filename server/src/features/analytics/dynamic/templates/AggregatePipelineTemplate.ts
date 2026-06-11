/**
 * Aggregate Pipeline Template
 *
 * The most flexible template for creating custom analytics.
 * Supports declarative pipeline specifications with filters, joins, dimensions, and measures.
 */

import type { AnalyticsTemplate } from '../../core/models';
import { registerTemplate } from '../../core';

export const aggregatePipelineTemplate: AnalyticsTemplate = {
  key: 'aggregatePipeline',
  name: 'Análise por Pipeline',
  description:
    'Executa uma pipeline declarativa com suporte a filtros, joins, dimensões e medidas.',
  processor: 'aggregatePipeline',
  requiredFields: [],
  optionalFields: [
    {
      key: 'pipeline',
      label: 'Pipeline JSON',
      types: [],
      required: false,
      description: 'Especificação da pipeline (source, joins, filters, dimensions, measures) - passado em params',
    },
  ],
  defaultOptions: { type: 'bar' },
  defaultParams: {},
};

registerTemplate(aggregatePipelineTemplate);

