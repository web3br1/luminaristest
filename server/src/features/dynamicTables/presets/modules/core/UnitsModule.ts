import type { ITableSchema } from '../../../models/DynamicTable.model';
import { city, stateUF } from '../../fields/text/TextPresets';
import { isActive } from '../../fields/boolean/BooleanPresets';

/**
 * @description Core module for the "units" table.
 * Represents physical or virtual business units (stores, branches, franchises).
 */
export const unitsModule = {
  name: 'Units',
  description: 'Business units — stores, branches or franchises.',
  category: 'business',
  schema: {
    defaultDisplayField: 'name',
    fields: [
      { name: 'name',    label: 'Unit Name', type: 'string',  required: true },
      { name: 'cnpj',   label: 'CNPJ',      type: 'string',  format: 'cnpj', required: false, unique: true },
      { name: 'address', label: 'Address',   type: 'string',  required: false },
      city,
      stateUF,
      {
        name: 'managerId',
        label: 'Manager',
        type: 'relation',
        required: false,
        relation: { targetTable: '@@PRESET_TABLE_KEY::employees' },
        searchable: false,
      },
      {
        name: 'type',
        label: 'Type',
        type: 'select',
        options: ['Own', 'Franchise', 'Department'],
        required: false,
      },
      { ...isActive, label: 'Is Active' },
    ],
  } as ITableSchema,
};
