import type { UserContext } from '../../../lib/authUtils';
import { NotFoundError, ValidationError } from '../../../lib/errors';
import logger from '../../../lib/logger';
import type { DynamicTableService } from '../../dynamicTables/services/DynamicTableService';
import type { IDynamicTableRepository } from '../../dynamicTables/repositories/IDynamicTableRepository';
import type { ITableSchema } from '../../dynamicTables/models/DynamicTable.model';
import type { AdvanceStageInput, ConvertLeadInput, CreateProposalInput, RecordNoShowInput } from '../dtos/CrmPipelineDto';
import { DEFAULT_CURRENCY } from '../constants';

/**
 * CrmPipelineService — server-side orchestration of CRM pipeline transitions.
 *
 * Moves the multi-step business logic that today lives in the frontend hook
 * `useLeadActions` (advance stage + create proposal + log activity) into a typed
 * backend service. It does NOT duplicate the DynamicTable engine: all reads/writes
 * go through `DynamicTableService`, which enforces validation, rules and policy.
 * CRM tables are resolved by their stable `internalName` (preset key).
 */
export class CrmPipelineService {
  constructor(
    private readonly dynamicTableService: DynamicTableService,
    private readonly repository: IDynamicTableRepository,
  ) {}

  /** Resolve a CRM table id by its stable preset internalName, or throw. */
  private async resolveTableId(user: UserContext, internalName: string): Promise<string> {
    const table = await this.repository.findTableByInternalName(user.userId, internalName);
    if (!table) {
      throw new NotFoundError(`CRM table '${internalName}' is not installed for this user.`);
    }
    return table.id;
  }

  /**
   * Advance a lead to a target stage, performing side effects:
   * - if the stage is a proposal stage and an amount is given, create a proposal record;
   * - update the lead's stage and proposal snapshot fields.
   */
  async advanceStage(user: UserContext, input: AdvanceStageInput) {
    // Fail fast if the CRM module is not installed for this user.
    await this.resolveTableId(user, 'leads');

    const proposalsTableId =
      (input.stageType || '').toLowerCase() === 'proposal' && input.amount != null
        ? await this.resolveTableId(user, 'leadProposals')
        : null;

    const leadPatch: Record<string, unknown> = { stageId: input.stageId };
    if (input.meetingAt) leadPatch.nextActionAt = input.meetingAt;
    if (input.amount != null) {
      leadPatch.latestProposalAmount = input.amount;
      leadPatch.latestProposalCurrency = input.currency || DEFAULT_CURRENCY;
      if (input.winProbability != null) leadPatch.latestProposalWinProbability = input.winProbability;
    }

    // Atomic: proposal create + lead update commit together or roll back together.
    const updated = await this.dynamicTableService.runInTransaction(async (tx) => {
      if (proposalsTableId) {
        await this.dynamicTableService.createTableData(user, proposalsTableId, {
          data: {
            leadId: input.leadId,
            amount: input.amount,
            currency: input.currency || DEFAULT_CURRENCY,
            winProbability: input.winProbability ?? undefined,
            status: 'Sent',
          },
        }, { tx });
      }
      // updateTableData resolves the parent table from the record id internally.
      return this.dynamicTableService.updateTableData(user, input.leadId, { data: leadPatch }, { tx });
    });

    logger.info('CRM lead advanced stage', { leadId: input.leadId, stageId: input.stageId });
    return updated;
  }

  /**
   * Convert a lead into an Account (+ optional Contact), atomically:
   * - creates a `crmAccounts` row (owner inherited from the lead's assignee);
   * - creates a `crmContacts` row linked to the new account and the source lead;
   * - marks the lead `Converted` and back-links account/contact + convertedAt.
   *
   * All three writes commit/roll back together (single transaction). The lead is
   * read BEFORE the transaction to snapshot unitId/leadName/email/phone/assigneeId.
   * Guard: a lead already `Converted` throws ValidationError (idempotency).
   */
  async convertLead(user: UserContext, input: ConvertLeadInput) {
    // Resolve the leads table OBJECT once (findTableByInternalName is tenant-scoped via
    // user.userId → NotFoundError if missing/foreign). We reuse it for BOTH the ownership
    // check (its id) and the partial-sync guard (its schema). The other CRM tables only
    // need their ids.
    const leadsTable = await this.repository.findTableByInternalName(user.userId, 'leads');
    if (!leadsTable) {
      throw new NotFoundError(`CRM table 'leads' is not installed for this user.`);
    }
    const leadsTableId = leadsTable.id;
    const accountsTableId = await this.resolveTableId(user, 'crmAccounts');
    const contactsTableId = await this.resolveTableId(user, 'crmContacts');

    // FIX 2 — partial-sync guard: a leads table not yet synced with the preset would have
    // the engine silently strip accountId/contactId/convertedAt and mark the lead Converted
    // with no links. Assert the schema can represent the conversion BEFORE any write.
    const schema = leadsTable.schema as unknown as ITableSchema;
    const names = new Set(schema.fields.map((f) => f.name));
    const missing = ['accountId', 'contactId', 'convertedAt'].filter((n) => !names.has(n));
    const statusField = schema.fields.find((f) => f.name === 'status');
    const canConverted = Array.isArray(statusField?.options) && statusField!.options.includes('Converted');
    if (missing.length || !canConverted) {
      throw new ValidationError(
        'A tabela de leads precisa ser sincronizada com o preset antes da conversão' +
          ` (faltam: ${[...missing, ...(canConverted ? [] : ["status:'Converted'"])].join(', ')}).`,
      );
    }

    // Snapshot the source lead before the transaction (we inherit owner + base fields).
    const leadRow = await this.repository.findDataById(input.leadId);
    if (!leadRow) {
      throw new NotFoundError(`Lead '${input.leadId}' não foi encontrado.`);
    }

    // FIX 1 — cross-tenant read guard: findDataById is NOT tenant-scoped, so a foreign
    // tenant's leadId would otherwise leak PII (and later fail with ForbiddenError →
    // enumeration). Assert the row belongs to THIS tenant's leads table BEFORE reading
    // any lead data into payloads. Contract §2: cross-tenant = NotFoundError.
    if (leadRow.dynamicTableId !== leadsTableId) {
      throw new NotFoundError(`Lead '${input.leadId}' não foi encontrado.`);
    }

    const lead = leadRow.data as Record<string, unknown>;

    if (lead.status === 'Converted') {
      throw new ValidationError('Lead already converted');
    }

    // Normalize unitId (a null/empty value is treated as absent). The account AND the
    // contact require unitId, so a lead without a unit cannot be converted — fail clearly
    // BEFORE the transaction (otherwise the engine would reject the account/contact create
    // with a generic error and roll back).
    const rawUnitId = lead.unitId;
    const unitId = typeof rawUnitId === 'string' && rawUnitId.length > 0 ? rawUnitId : undefined;
    if (!unitId) {
      throw new ValidationError('Lead sem unidade (unitId) não pode ser convertido: defina a unidade do lead antes da conversão.');
    }
    const assigneeId = lead.assigneeId as string | undefined;
    const leadName = lead.leadName as string | undefined;
    const leadEmail = lead.email as string | undefined;
    const leadPhone = lead.phone as string | undefined;

    // Build the account payload, omitting undefined optional fields (never write undefined).
    const accountData: Record<string, unknown> = { name: input.account.name, unitId };
    if (assigneeId !== undefined) accountData.ownerId = assigneeId;
    if (input.account.segment !== undefined) accountData.segment = input.account.segment;
    if (input.account.size !== undefined) accountData.size = input.account.size;
    if (input.account.website !== undefined) accountData.website = input.account.website;
    if (input.account.taxId !== undefined) accountData.taxId = input.account.taxId;
    if (input.account.city !== undefined) accountData.city = input.account.city;
    if (input.account.state !== undefined) accountData.state = input.account.state;

    // Atomic: account create + contact create + lead update commit/rollback together.
    const result = await this.dynamicTableService.runInTransaction(async (tx) => {
      const account = await this.dynamicTableService.createTableData(
        user,
        accountsTableId,
        { data: accountData },
        { tx },
      );

      const contactData: Record<string, unknown> = {
        name: input.contact?.name ?? leadName,
        unitId,
        accountId: account.id,
        leadId: leadRow.id,
      };
      if (leadEmail !== undefined) contactData.email = leadEmail;
      if (leadPhone !== undefined) contactData.phone = leadPhone;
      if (input.contact?.jobTitle !== undefined) contactData.jobTitle = input.contact.jobTitle;
      if (input.contact?.role !== undefined) contactData.role = input.contact.role;
      if (assigneeId !== undefined) contactData.ownerId = assigneeId;

      const contact = await this.dynamicTableService.createTableData(
        user,
        contactsTableId,
        { data: contactData },
        { tx },
      );

      const updatedLead = await this.dynamicTableService.updateTableData(
        user,
        leadRow.id,
        {
          data: {
            status: 'Converted',
            accountId: account.id,
            contactId: contact.id,
            convertedAt: new Date().toISOString(),
          },
        },
        // isSystem: convertedAt is a readOnly field and the lead status moves to a terminal
        // state — this is a server-orchestrated transition, not a direct user edit.
        { tx, isSystem: true },
      );

      return { account, contact, lead: updatedLead };
    });

    logger.info('Lead converted', { leadId: leadRow.id, accountId: result.account.id });
    return result;
  }

  /** Create a standalone proposal and refresh the lead's latest-proposal snapshot. */
  async createProposal(user: UserContext, input: CreateProposalInput) {
    const proposalsTableId = await this.resolveTableId(user, 'leadProposals');

    // Atomic: proposal create + lead snapshot update commit/rollback together.
    return this.dynamicTableService.runInTransaction(async (tx) => {
      const proposal = await this.dynamicTableService.createTableData(user, proposalsTableId, {
        data: {
          leadId: input.leadId,
          amount: input.amount,
          currency: input.currency,
          winProbability: input.winProbability ?? undefined,
          estimatedCloseDate: input.estimatedCloseDate ?? undefined,
          status: 'Draft',
        },
      }, { tx });
      await this.dynamicTableService.updateTableData(user, input.leadId, {
        data: {
          latestProposalAmount: input.amount,
          latestProposalCurrency: input.currency,
          latestProposalWinProbability: input.winProbability ?? undefined,
          latestProposalEtaClose: input.estimatedCloseDate ?? undefined,
        },
      }, { tx });
      return proposal;
    });
  }

  /** Record a no-show: log an activity and either reschedule or revert the lead's stage. */
  async recordNoShow(user: UserContext, input: RecordNoShowInput) {
    const activitiesTableId = await this.resolveTableId(user, 'leadActivities');

    // Atomic: activity log + optional lead stage/schedule update commit/rollback together.
    await this.dynamicTableService.runInTransaction(async (tx) => {
      await this.dynamicTableService.createTableData(user, activitiesTableId, {
        data: {
          leadId: input.leadId,
          type: 'meeting_no_show',
          message: input.option === 'reschedule' ? 'No-show — meeting rescheduled' : 'No-show — stage reverted',
          payload: { when: input.rescheduleAt ?? undefined },
        },
      }, { tx });

      if (input.option === 'reschedule' && input.rescheduleAt) {
        await this.dynamicTableService.updateTableData(user, input.leadId, { data: { nextActionAt: input.rescheduleAt } }, { tx });
      } else if (input.option === 'revert' && input.previousStageId) {
        await this.dynamicTableService.updateTableData(user, input.leadId, { data: { stageId: input.previousStageId } }, { tx });
      }
    });

    return { ok: true };
  }
}
