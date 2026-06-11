import type { ITableSchema } from '../../../models/DynamicTable.model';
import { amount, description, unitId, date } from '../../fields';

/**
 * @description
 * Base module for non-operational revenues (interest, rents, resales, etc.).
 * Keeps non-core revenues clearly separated from operational revenue.
 */
export const otherRevenuesModule = {
  name: 'Other Revenues',
  description: 'Records non-operational revenues such as interests, rents and exceptional gains.',
  category: 'finance',
  schema: {
    defaultDisplayField: 'description',
    fields: [
      { ...unitId, label: 'Unit' },
      { ...date, label: 'Revenue Date' },
      {
        ...amount,
        label: 'Amount',
      },
      {
        ...description,
        label: 'Description',
        required: false,
      },
      {
        name: 'type',
        label: 'Revenue Type',
        type: 'select',
        required: true,
        options: ['Interest', 'Rent', 'Resale', 'Adjustment', 'Other'],
      },
      {
        name: 'source',
        label: 'Revenue Source',
        type: 'string',
        required: false,
        requiredIf: { field: 'type', op: 'in', value: ['Interest', 'Rent', 'Resale'] },
        description: 'Revenue source (financial institution, tenant, etc.).',
      },
    ],
  } as ITableSchema,
};


