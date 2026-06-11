import type { ITableSchema } from '../../../models/DynamicTable.model';
import { unitId, date } from '../../fields';
import { amount } from '../../fields/number/NumberPresets';

/**
 * @description
 * Base module for recording financial baselines (initial cash, equity, liabilities)
 * by unit and date.
 */
export const financialBaselinesModule = {
  name: 'Financial Baselines',
  description: 'Stores financial baseline snapshots (cash, equity, liabilities) per unit and date.',
  category: 'finance',
  schema: {
    defaultDisplayField: 'date',
    fields: [
      { ...unitId, label: 'Unit' },
      { ...date, label: 'Baseline Date' },
      {
        ...amount,
        name: 'openingCash',
        label: 'Opening Cash',
        required: false,
      },
      {
        ...amount,
        name: 'equity',
        label: 'Equity',
        required: false,
      },
      {
        ...amount,
        name: 'liabilities',
        label: 'Liabilities',
        required: false,
      },
      {
        name: 'notes',
        label: 'Notes',
        type: 'textarea',
        required: false,
      },
    ],
    compositeUnique: [
      { fields: ['unitId', 'date'], errorMessage: 'A financial baseline already exists for this unit and date.' },
    ],
  } as ITableSchema,
};


