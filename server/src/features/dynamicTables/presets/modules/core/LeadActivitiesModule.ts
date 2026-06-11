import type { ITableSchema } from '../../../models/DynamicTable.model';

/**
 * @description Core module for the "leadActivities" table.
 * Audit log of all interactions and status changes on a lead record.
 * Almost entirely domain-specific — no generic field presets apply here.
 */
export const leadActivitiesModule = {
  name: 'Lead Activities',
  description: 'Audit log of interactions and state transitions on leads.',
  category: 'leads',
  schema: {
    defaultDisplayField: 'type',
    fields: [
      {
        name: 'leadId',
        label: 'Lead',
        type: 'relation',
        required: true,
        relation: { targetTable: '@@PRESET_TABLE_KEY::leads' },
        searchable: false,
      },
      {
        name: 'actorId',
        label: 'Actor',
        type: 'relation',
        required: false,
        relation: { targetTable: '@@PRESET_TABLE_KEY::employees' },
        searchable: false,
      },
      {
        name: 'type',
        label: 'Type',
        type: 'select',
        required: true,
        options: [
          'note',
          'call',
          'email',
          'meeting',
          'meeting_no_show',
          'meeting_cancelled',
          'status_change',
          'stage_change',
          'proposal',
          'field_update',
          'task',
        ],
      },
      { name: 'message', label: 'Message', type: 'textarea', required: false },
      { name: 'payload', label: 'Payload',  type: 'json',     required: false, hidden: true, searchable: false },
      {
        name: 'prevStageId',
        label: 'Prev Stage',
        type: 'relation',
        required: false,
        relation: { targetTable: '@@PRESET_TABLE_KEY::leadStages' },
        searchable: false,
      },
      {
        name: 'nextStageId',
        label: 'Next Stage',
        type: 'relation',
        required: false,
        relation: { targetTable: '@@PRESET_TABLE_KEY::leadStages' },
        searchable: false,
      },
    ],
  } as ITableSchema,
};
