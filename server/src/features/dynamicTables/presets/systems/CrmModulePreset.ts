import type { PresetSuite } from '..';
import { createTableFromModule } from '../../utils/TableFactory';
import { leadPipelinesModule } from '../modules/core/LeadPipelinesModule';
import { leadStagesModule } from '../modules/core/LeadStagesModule';
import { leadsModule } from '../modules/core/LeadsModule';
import { leadProposalsModule } from '../modules/core/LeadProposalsModule';
import { leadActivitiesModule } from '../modules/core/LeadActivitiesModule';
import { crmContactsModule } from '../modules/crm/CrmContactsModule';
import { crmAccountsModule } from '../modules/crm/CrmAccountsModule';

/**
 * @description
 * CRM Module — a **selectable** preset suite (NOT auto-installed in CoreSystemPreset).
 *
 * It expands the lead ecosystem (already part of Core) into a complete CRM:
 * pipelines, stages, leads, proposals and activities PLUS dedicated
 * Accounts (companies) and Contacts (people).
 *
 * Depends on Core infrastructure tables (`units`, `employees`) for its relations,
 * exactly like the existing leads tables do.
 *
 * Isolation note: this file does not mutate any Core module. The leads↔contact/account
 * cross-links live on the CRM-side tables (crmContacts.leadId, crmContacts.accountId).
 */
export const CrmModulePreset: PresetSuite = {
  key: 'crmModule',
  name: 'Módulo CRM',
  description: 'CRM completo: funil de leads, propostas, atividades, contas e contatos.',
  tables: {
    // --- Pipeline core (reused from the lead ecosystem) ---
    leadPipelines:  createTableFromModule(leadPipelinesModule),
    leadStages:     createTableFromModule(leadStagesModule),
    leads:          createTableFromModule(leadsModule),
    leadProposals:  createTableFromModule(leadProposalsModule),
    leadActivities: createTableFromModule(leadActivitiesModule),

    // --- CRM-specific entities ---
    crmAccounts:    createTableFromModule(crmAccountsModule),
    crmContacts:    createTableFromModule(crmContactsModule),
  },
};

export default CrmModulePreset;
