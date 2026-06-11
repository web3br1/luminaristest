import type { ITableSchema } from '../../../models/DynamicTable.model';
import { email, notes, phone } from '../../fields/text/TextPresets';
import { unitId } from '../../fields/relation/RelationPresets';

/**
 * @description Core module for the "leads" table.
 * Full CRM lead record with BANT scoring, pipeline assignment and proposal snapshots.
 */
export const leadsModule = {
  name: 'Leads',
  description: 'CRM lead records with BANT scoring, pipeline stage and proposal snapshots.',
  category: 'leads',
  schema: {
    defaultDisplayField: 'leadName',
    fields: [
      { ...unitId, label: 'Unit' },
      {
        name: 'pipelineId',
        label: 'Pipeline',
        type: 'relation',
        required: false,
        relation: { targetTable: '@@PRESET_TABLE_KEY::leadPipelines' },
        searchable: false,
      },
      {
        name: 'stageId',
        label: 'Stage',
        type: 'relation',
        required: false,
        relation: { targetTable: '@@PRESET_TABLE_KEY::leadStages' },
        searchable: false,
      },
      { name: 'leadName', label: 'Lead Name',  type: 'string', required: true },
      { ...email, required: false, unique: false },
      { ...phone },
      { name: 'source',   label: 'Source',     type: 'string', required: false },
      {
        name: 'assigneeId',
        label: 'Owner',
        type: 'relation',
        required: false,
        relation: { targetTable: '@@PRESET_TABLE_KEY::employees' },
        searchable: false,
      },
      notes,
      // --- BANT scoring ---
      { name: 'bantBudget',    label: 'BANT: Budget',    type: 'select', options: ['Low', 'Medium', 'High'],                   required: false, searchable: false },
      { name: 'bantAuthority', label: 'BANT: Authority', type: 'select', options: ['Low', 'Medium', 'High'],                   required: false, searchable: false },
      { name: 'bantNeed',      label: 'BANT: Need',      type: 'select', options: ['Low', 'Medium', 'High'],                   required: false, searchable: false },
      { name: 'bantTiming',    label: 'BANT: Timing',    type: 'select', options: ['Urgent', 'Short', 'Medium', 'Long'],       required: false, searchable: false },
      {
        name: 'score',
        label: 'Score',
        type: 'number',
        numberFormat: 'integer',
        required: false,
        validation: { minValue: 0, maxValue: 100 },
        defaultValue: 0,
        searchable: false,
      },
      // --- Operational dates ---
      { name: 'lastContactAt', label: 'Last Contact At', type: 'datetime', required: false, readOnly: true, searchable: false },
      { name: 'nextActionAt',  label: 'Next Action At',  type: 'datetime', required: false,                searchable: false },
      // --- Latest proposal snapshot ---
      {
        name: 'latestProposalAmount',
        label: 'Latest Proposal Amount',
        type: 'number',
        numberFormat: 'currency',
        required: false,
        validation: { minValue: 0 },
        searchable: false,
      },
      {
        name: 'latestProposalCurrency',
        label: 'Latest Proposal Currency',
        type: 'select',
        options: ['BRL', 'USD', 'EUR'],
        required: false,
      },
      { name: 'latestProposalEtaClose',        label: 'Latest ETA Close',  type: 'date',   required: false, searchable: false },
      {
        name: 'latestProposalWinProbability',
        label: 'Latest Win %',
        type: 'number',
        numberFormat: 'percentage',
        required: false,
        validation: { minValue: 0, maxValue: 100 },
        searchable: false,
      },
      {
        name: 'status',
        label: 'Lead Status',
        type: 'select',
        options: ['Open', 'Won', 'Lost', 'Disqualified'],
        required: true,
        defaultValue: 'Open',
      },
    ],
  } as ITableSchema,
};
