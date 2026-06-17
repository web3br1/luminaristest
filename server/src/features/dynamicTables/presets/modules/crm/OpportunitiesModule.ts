import type { ITableSchema } from '../../../models/DynamicTable.model';
import { name, notes } from '../../fields/text/TextPresets';
import { unitId } from '../../fields/relation/RelationPresets';

/**
 * @description CRM module for the "crmOpportunities" table.
 *
 * First-class Opportunity (Salesforce-style): owns the deal (amount / stage /
 * close / status) and runs IN PARALLEL to the lead pipeline (it does NOT break
 * lead qualification). It REUSES `leadPipelines`/`leadStages` (they are not
 * entity-specific) and links back to its source lead/account/contact.
 *
 * Part of the selectable CRM module (CrmModulePreset). For tenants that already
 * have the CRM module installed, this single table is added at runtime via the
 * `install-table` mechanism (PresetSyncService.installTableFromPreset).
 *
 * Relation markers (@@PRESET_TABLE_KEY::x) are resolved to the user's REAL
 * installed table ids at install time (mirrors installPresetAsSystem pass-2).
 */
export const opportunitiesModule = {
  name: 'CRM Opportunities',
  description: 'First-class sales opportunities (deals) — value, stage, close and status — reusing the lead pipeline.',
  category: 'leads',
  schema: {
    defaultDisplayField: 'name',
    fields: [
      { ...unitId, label: 'Unit' },
      {
        name: 'leadId',
        label: 'Lead',
        type: 'relation',
        required: false,
        relation: { targetTable: '@@PRESET_TABLE_KEY::leads' },
        searchable: false,
      },
      {
        name: 'accountId',
        label: 'Account',
        type: 'relation',
        required: false,
        relation: { targetTable: '@@PRESET_TABLE_KEY::crmAccounts' },
        searchable: false,
      },
      {
        name: 'contactId',
        label: 'Contact',
        type: 'relation',
        required: false,
        relation: { targetTable: '@@PRESET_TABLE_KEY::crmContacts' },
        searchable: false,
      },
      {
        name: 'pipelineId',
        label: 'Pipeline',
        type: 'relation',
        required: true,
        relation: { targetTable: '@@PRESET_TABLE_KEY::leadPipelines' },
        searchable: false,
      },
      {
        name: 'stageId',
        label: 'Stage',
        type: 'relation',
        required: true,
        relation: { targetTable: '@@PRESET_TABLE_KEY::leadStages' },
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
      { ...name, label: 'Opportunity Name' },
      {
        name: 'amount',
        label: 'Amount',
        type: 'number',
        numberFormat: 'currency',
        required: false,
        validation: { minValue: 0 },
        searchable: false,
      },
      {
        name: 'currency',
        label: 'Currency',
        type: 'select',
        options: ['BRL', 'USD', 'EUR'],
        required: false,
        defaultValue: 'BRL',
        searchable: false,
      },
      {
        name: 'winProbability',
        label: 'Win Probability %',
        type: 'number',
        numberFormat: 'percentage',
        required: false,
        validation: { minValue: 0, maxValue: 100 },
        searchable: false,
      },
      { name: 'estimatedCloseDate', label: 'Estimated Close Date', type: 'date', required: false, searchable: false },
      {
        name: 'status',
        label: 'Status',
        type: 'select',
        options: ['Open', 'Won', 'Lost'],
        required: true,
        defaultValue: 'Open',
      },
      { name: 'closedAt', label: 'Closed At', type: 'datetime', required: false, readOnly: true, searchable: false },
      notes,
    ],
  } as ITableSchema,
};
