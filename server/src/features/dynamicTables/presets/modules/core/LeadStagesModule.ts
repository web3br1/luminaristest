import type { ITableSchema } from '../../../models/DynamicTable.model';
import { name } from '../../fields/text/TextPresets';

/**
 * @description Core module for the "leadStages" table.
 * Defines the ordered stages within a sales pipeline.
 */
export const leadStagesModule = {
  name: 'Lead Stages',
  description: 'Ordered stages within a sales pipeline (e.g. Proposal, Negotiation, Won).',
  category: 'leads',
  schema: {
    defaultDisplayField: 'name',
    fields: [
      {
        name: 'pipelineId',
        label: 'Pipeline',
        type: 'relation',
        required: true,
        relation: { targetTable: '@@PRESET_TABLE_KEY::leadPipelines' },
        searchable: false,
      },
      { ...name, label: 'Stage Name' },
      {
        name: 'type',
        label: 'Stage Type',
        type: 'select',
        required: false,
        options: ['init', 'meeting', 'proposal', 'negotiation', 'closed_won', 'closed_lost'],
        searchable: false,
      },
      {
        name: 'order',
        label: 'Order',
        type: 'number',
        numberFormat: 'integer',
        required: true,
        defaultValue: 0,
        searchable: false,
      },
      {
        name: 'defaultWinProbability',
        label: 'Default Win Probability %',
        type: 'number',
        numberFormat: 'percentage',
        required: false,
        validation: { minValue: 0, maxValue: 100 },
        defaultValue: 0,
        searchable: false,
      },
    ],
    compositeUnique: [
      { fields: ['pipelineId', 'name'],  errorMessage: 'A stage with this name already exists in this pipeline.' },
      { fields: ['pipelineId', 'order'], errorMessage: 'A stage with this order already exists in this pipeline.' },
    ],
  } as ITableSchema,
};
