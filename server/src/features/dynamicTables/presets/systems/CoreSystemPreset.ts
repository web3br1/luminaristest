import type { ITableSchema } from '../../models/DynamicTable.model';
import type { PresetSuite } from '..';
import { createTableFromModule } from '../../utils/TableFactory';
import { unitsModule } from '../modules/core/UnitsModule';
import { employeesModule } from '../modules/core/EmployeesModule';
import { tasksModule } from '../modules/core/TasksModule';
import { stakeholdersModule } from '../modules/core/StakeholdersModule';
import { leadPipelinesModule } from '../modules/core/LeadPipelinesModule';
import { leadStagesModule } from '../modules/core/LeadStagesModule';
import { leadsModule } from '../modules/core/LeadsModule';
import { leadProposalsModule } from '../modules/core/LeadProposalsModule';
import { leadActivitiesModule } from '../modules/core/LeadActivitiesModule';

/**
 * @description
 * The core system preset — installed for every user on account creation.
 * Provides infrastructure tables (employees, units, tasks/kanban, leads CRM)
 * that all other business presets (e.g. BeautySalon) depend on.
 *
 * Rule: `analyticsDefinitions` stays inline here — it is system infrastructure,
 * not a user-facing business entity, and has no equivalent module.
 */
export const CoreSystemPreset: PresetSuite = {
  suiteName: 'Sistema Central',
  tables: {
    // --- Infrastructure ---
    units:      createTableFromModule(unitsModule),
    employees:  createTableFromModule(employeesModule),
    tasks:      createTableFromModule(tasksModule),
    stakeholders: createTableFromModule(stakeholdersModule),

    // --- Leads CRM ---
    leadPipelines:  createTableFromModule(leadPipelinesModule),
    leadStages:     createTableFromModule(leadStagesModule),
    leads:          createTableFromModule(leadsModule),
    leadProposals:  createTableFromModule(leadProposalsModule),
    leadActivities: createTableFromModule(leadActivitiesModule),

    // --- System-only: Analytics Definitions ---
    // Kept inline intentionally — this is internal system infrastructure,
    // not a user-facing business entity.
    analyticsDefinitions: {
      name: 'Analytics Definitions',
      category: 'operations',
      schema: {
        defaultDisplayField: 'title',
        ui: { presentation: 'system' },
        fields: [
          { name: 'key',       label: 'Key',          type: 'string',   required: true,  unique: true },
          { name: 'title',     label: 'Title',         type: 'string',   required: true },
          { name: 'chartType', label: 'Chart Type',    type: 'select',   required: true,  options: ['bar', 'line', 'area', 'pie', 'donut', 'table'] },
          { name: 'scope',     label: 'Scope',         type: 'select',   required: true,  options: ['global', 'preset', 'table'], defaultValue: 'preset' },
          { name: 'presetKey', label: 'Preset Key',    type: 'string',   required: false },
          { name: 'tableKey',  label: 'Table Key',     type: 'string',   required: false },
          { name: 'pipeline',  label: 'Pipeline (JSON)', type: 'json',   required: true },
          { name: 'options',   label: 'Options (JSON)', type: 'json',    required: false },
          { name: 'access',    label: 'Access (JSON)',  type: 'json',    required: false },
          { name: 'version',   label: 'Version',        type: 'number',  numberFormat: 'integer', required: false, defaultValue: 1 },
          { name: 'published', label: 'Published',      type: 'boolean', required: true, defaultValue: true },
          {
            name: 'createdBy',
            label: 'Created By',
            type: 'relation',
            required: false,
            relation: { targetTable: '@@PRESET_TABLE_KEY::employees' },
          },
          { name: 'createdAt', label: 'Created At',   type: 'datetime', required: false },
          { name: 'updatedAt', label: 'Updated At',   type: 'datetime', required: false },
        ],
      } as ITableSchema,
    },
  },
};
