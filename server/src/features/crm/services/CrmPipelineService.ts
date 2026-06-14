import type { UserContext } from '../../../lib/authUtils';
import { NotFoundError } from '../../../lib/errors';
import logger from '../../../lib/logger';
import type { DynamicTableService } from '../../dynamicTables/services/DynamicTableService';
import type { IDynamicTableRepository } from '../../dynamicTables/repositories/IDynamicTableRepository';
import type { AdvanceStageInput, CreateProposalInput, RecordNoShowInput } from '../dtos/CrmPipelineDto';

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

    if ((input.stageType || '').toLowerCase() === 'proposal' && input.amount != null) {
      const proposalsTableId = await this.resolveTableId(user, 'leadProposals');
      await this.dynamicTableService.createTableData(user, proposalsTableId, {
        data: {
          leadId: input.leadId,
          amount: input.amount,
          currency: input.currency || 'BRL',
          winProbability: input.winProbability ?? undefined,
          status: 'Sent',
        },
      });
    }

    const leadPatch: Record<string, unknown> = { stageId: input.stageId };
    if (input.meetingAt) leadPatch.nextActionAt = input.meetingAt;
    if (input.amount != null) {
      leadPatch.latestProposalAmount = input.amount;
      leadPatch.latestProposalCurrency = input.currency || 'BRL';
      if (input.winProbability != null) leadPatch.latestProposalWinProbability = input.winProbability;
    }

    // updateTableData resolves the parent table from the record id internally.
    const updated = await this.dynamicTableService.updateTableData(user, input.leadId, { data: leadPatch });
    logger.info('CRM lead advanced stage', { leadId: input.leadId, stageId: input.stageId });
    return updated;
  }

  /** Create a standalone proposal and refresh the lead's latest-proposal snapshot. */
  async createProposal(user: UserContext, input: CreateProposalInput) {
    const proposalsTableId = await this.resolveTableId(user, 'leadProposals');
    const proposal = await this.dynamicTableService.createTableData(user, proposalsTableId, {
      data: {
        leadId: input.leadId,
        amount: input.amount,
        currency: input.currency,
        winProbability: input.winProbability ?? undefined,
        estimatedCloseDate: input.estimatedCloseDate ?? undefined,
        status: 'Draft',
      },
    });

    await this.dynamicTableService.updateTableData(user, input.leadId, {
      data: {
        latestProposalAmount: input.amount,
        latestProposalCurrency: input.currency,
        latestProposalWinProbability: input.winProbability ?? undefined,
        latestProposalEtaClose: input.estimatedCloseDate ?? undefined,
      },
    });
    return proposal;
  }

  /** Record a no-show: log an activity and either reschedule or revert the lead's stage. */
  async recordNoShow(user: UserContext, input: RecordNoShowInput) {
    const activitiesTableId = await this.resolveTableId(user, 'leadActivities');

    await this.dynamicTableService.createTableData(user, activitiesTableId, {
      data: {
        leadId: input.leadId,
        type: 'meeting_no_show',
        message: input.option === 'reschedule' ? 'No-show — meeting rescheduled' : 'No-show — stage reverted',
        payload: { when: input.rescheduleAt ?? undefined },
      },
    });

    if (input.option === 'reschedule' && input.rescheduleAt) {
      await this.dynamicTableService.updateTableData(user, input.leadId, {
        data: { nextActionAt: input.rescheduleAt },
      });
    } else if (input.option === 'revert' && input.previousStageId) {
      await this.dynamicTableService.updateTableData(user, input.leadId, {
        data: { stageId: input.previousStageId },
      });
    }

    return { ok: true };
  }
}
