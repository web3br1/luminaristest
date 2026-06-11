import type { ITableSchema } from '../../../models/DynamicTable.model';
import { amount, notes } from '../../fields';

/**
 * @description Core module for the "leadProposals" table.
 * Tracks versioned proposals linked to a lead record.
 */
export const leadProposalsModule = {
  name: 'Lead Proposals',
  description: 'Versioned proposals (quotes) linked to a CRM lead.',
  category: 'leads',
  schema: {
    defaultDisplayField: 'status',
    fields: [
      {
        name: 'leadId',
        label: 'Lead',
        type: 'relation',
        required: true,
        relation: { targetTable: '@@PRESET_TABLE_KEY::leads' },
        searchable: false,
      },
      { ...amount, label: 'Amount' },
      {
        name: 'currency',
        label: 'Currency',
        type: 'select',
        options: ['BRL', 'USD', 'EUR'],
        required: true,
      },
      { name: 'estimatedCloseDate', label: 'Estimated Close Date', type: 'date', required: false, searchable: false },
      {
        name: 'winProbability',
        label: 'Win Probability %',
        type: 'number',
        numberFormat: 'percentage',
        required: false,
        validation: { minValue: 0, maxValue: 100 },
        searchable: false,
      },
      notes,
      {
        name: 'status',
        label: 'Status',
        type: 'select',
        options: ['Draft', 'Sent', 'Accepted', 'Rejected', 'Expired'],
        required: true,
        defaultValue: 'Draft',
      },
    ],
    immutableAfter: [
      {
        condition: { field: 'status', op: 'in', value: ['Accepted', 'Rejected', 'Expired'] },
        scope: 'all',
        errorMessage: 'This proposal is closed and cannot be edited.',
      },
    ],
  } as ITableSchema,
};
