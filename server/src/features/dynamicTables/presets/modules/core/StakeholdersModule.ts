import type { ITableSchema } from '../../../models/DynamicTable.model';
import { name, email } from '../../fields/text/TextPresets';

/**
 * @description Core module for the "stakeholders" table.
 * Tracks key business stakeholders (investors, partners, board members, etc.).
 */
export const stakeholdersModule = {
  name: 'Stakeholders',
  description: 'Key business stakeholders — investors, partners, advisors.',
  category: 'business',
  schema: {
    defaultDisplayField: 'name',
    fields: [
      { ...name, label: 'Name', unique: true },
      { name: 'role',    label: 'Role',    type: 'string', required: true },
      { ...email, required: false, unique: false, label: 'Contact Email' },
      { name: 'company', label: 'Company', type: 'string', required: false },
    ],
  } as ITableSchema,
};
