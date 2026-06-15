import type { UserContext } from '../../../lib/authUtils';
import { NotFoundError } from '../../../lib/errors';
import logger from '../../../lib/logger';
import type { DynamicTableService } from '../../dynamicTables/services/DynamicTableService';
import type { IDynamicTableRepository } from '../../dynamicTables/repositories/IDynamicTableRepository';
import type { AdvanceStageInput, CreateProposalInput, RecordNoShowInput } from '../dtos/CrmPipelineDto';
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
