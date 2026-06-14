import type { ITableSchema } from '../../../models/DynamicTable.model';
import { name, email, phone, notes } from '../../fields/text/TextPresets';
import { unitId } from '../../fields/relation/RelationPresets';

/**
 * @description CRM module for the "crmContacts" table.
 * People (decision-makers, influencers) that belong to an account and may be linked to leads.
 * Part of the selectable CRM module (CrmModulePreset) — not auto-installed.
 */
export const crmContactsModule = {
  name: 'CRM Contacts',
  description: 'People tracked in the CRM, linked to accounts and (optionally) leads.',
  category: 'leads',
  schema: {
    defaultDisplayField: 'name',
    fields: [
      { ...unitId, label: 'Unit' },
      { ...name, label: 'Contact Name' },
      { ...email, required: false, unique: false },
      { ...phone },
      { name: 'jobTitle', label: 'Job Title', type: 'string', required: false },
      {
        name: 'accountId',
        label: 'Account',
        type: 'relation',
        required: false,
        relation: { targetTable: '@@PRESET_TABLE_KEY::crmAccounts' },
        searchable: false,
      },
      {
        name: 'leadId',
        label: 'Lead',
        type: 'relation',
        required: false,
        relation: { targetTable: '@@PRESET_TABLE_KEY::leads' },
        searchable: false,
      },
      {
        name: 'ownerId',
        label: 'Owner',
        type: 'relation',
        required: false,
        relation: { targetTable: '@@PRESET_TABLE_KEY::employees' },
        searchable: false,
      },
      {
        name: 'role',
        label: 'Buying Role',
        type: 'select',
        options: ['Decision Maker', 'Influencer', 'Champion', 'Gatekeeper', 'User'],
        required: false,
        searchable: false,
      },
      notes,
    ],
  } as ITableSchema,
};
