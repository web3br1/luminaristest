import type { ITableSchema } from '../../../models/DynamicTable.model';
import { name, notes, taxId, city, stateUF } from '../../fields/text/TextPresets';
import { unitId } from '../../fields/relation/RelationPresets';

/**
 * @description CRM module for the "crmAccounts" table.
 * Organizations (companies) that leads and contacts belong to.
 * Part of the selectable CRM module (CrmModulePreset) — not auto-installed.
 */
export const crmAccountsModule = {
  name: 'CRM Accounts',
  description: 'Organizations (companies) tracked in the CRM, linked to leads and contacts.',
  category: 'leads',
  schema: {
    defaultDisplayField: 'name',
    fields: [
      { ...unitId, label: 'Unit' },
      { ...name, label: 'Account Name' },
      { name: 'segment', label: 'Segment', type: 'string', required: false },
      {
        name: 'size',
        label: 'Company Size',
        type: 'select',
        options: ['Micro', 'Small', 'Medium', 'Large', 'Enterprise'],
        required: false,
        searchable: false,
      },
      { name: 'website', label: 'Website', type: 'string', required: false, searchable: false },
      { ...taxId },
      {
        name: 'ownerId',
        label: 'Owner',
        type: 'relation',
        required: false,
        relation: { targetTable: '@@PRESET_TABLE_KEY::employees' },
        searchable: false,
      },
      { ...city },
      { ...stateUF },
      notes,
    ],
  } as ITableSchema,
};
