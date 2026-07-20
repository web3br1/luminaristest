import { Request, Response } from 'express';
import { getUserContextFromRequest } from '../lib/authUtils';
import { handleApiError } from '../lib/apiUtils';
import { UnauthorizedError } from '../lib/errors';
import logger from '../lib/logger';
import { getFactory } from '../lib/factory';
import { resolveAccountingScope } from '../features/accounting/scope/AccountingScope';
import type { WonOpportunityFact } from '../features/accounting/sync/bridges/CrmReceivableBridge';
import {
  AdvanceStageSchema,
  ConvertLeadSchema,
  CreateProposalSchema,
  RecordNoShowSchema,
} from '../features/crm/dtos/CrmPipelineDto';
import { CrmAnalyticsQuerySchema } from '../features/crm/dtos/CrmAnalyticsDto';
import {
  AdvanceOpportunitySchema,
  ConvertLeadToOpportunitySchema,
} from '../features/crm/dtos/CrmOpportunityDto';

export const advanceStage = async (req: Request, res: Response) => {
  try {
    const user = getUserContextFromRequest(req);
    if (!user) throw new UnauthorizedError();
    const parsed = AdvanceStageSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.flatten() });
    }
    const data = await getFactory().getCrmPipelineService().advanceStage(user, parsed.data);
    return res.json({ success: true, data });
  } catch (error) {
    return handleApiError(error, res);
  }
};

export const createProposal = async (req: Request, res: Response) => {
  try {
    const user = getUserContextFromRequest(req);
    if (!user) throw new UnauthorizedError();
    const parsed = CreateProposalSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.flatten() });
    }
    const data = await getFactory().getCrmPipelineService().createProposal(user, parsed.data);
    return res.status(201).json({ success: true, data });
  } catch (error) {
    return handleApiError(error, res);
  }
};

export const recordNoShow = async (req: Request, res: Response) => {
  try {
    const user = getUserContextFromRequest(req);
    if (!user) throw new UnauthorizedError();
    const parsed = RecordNoShowSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.flatten() });
    }
    const data = await getFactory().getCrmPipelineService().recordNoShow(user, parsed.data);
    return res.json({ success: true, data });
  } catch (error) {
    return handleApiError(error, res);
  }
};

export const convertLead = async (req: Request, res: Response) => {
  try {
    const user = getUserContextFromRequest(req);
    if (!user) throw new UnauthorizedError();
    const parsed = ConvertLeadSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.flatten() });
    }
    const data = await getFactory().getCrmPipelineService().convertLead(user, parsed.data);
    return res.status(201).json({ success: true, data });
  } catch (error) {
    return handleApiError(error, res);
  }
};

export const advanceOpportunity = async (req: Request, res: Response) => {
  try {
    const user = getUserContextFromRequest(req);
    if (!user) throw new UnauthorizedError();
    const parsed = AdvanceOpportunitySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.flatten() });
    }
    const data = await getFactory().getCrmPipelineService().advanceOpportunity(user, parsed.data);

    // Post-commit accounting integration (§2.1: at the controller/integration layer,
    // NEVER inside the CRM transaction). Best-effort: a sync failure must NOT undo the
    // Won transition — the reconciliation job re-drives it idempotently.
    await maybeSyncOpportunityWon(user, data);

    return res.json({ success: true, data });
  } catch (error) {
    return handleApiError(error, res);
  }
};

/**
 * If the advanced opportunity is now `Won`, create its Contas a Receber via the CRM→AR bridge
 * (ADR-CRM-AR-SEAM — recognition D 1.1.5 / C 3.1; settlement is the human-registered receipt).
 * Runs AFTER the CRM transition commits and swallows its own errors (non-fatal) — the
 * source fact stands regardless, and unbooked Won deals are caught by reconciliation.
 */
async function maybeSyncOpportunityWon(
  user: { userId: string },
  result: { id: string; data?: unknown },
): Promise<void> {
  const oppData = (result.data ?? {}) as Record<string, unknown>;
  if (oppData.status !== 'Won') return;

  // Never default/infer the unit — only post within the opportunity's own unit (§2 tenancy).
  const unitId = typeof oppData.unitId === 'string' ? oppData.unitId : '';
  if (!unitId) {
    logger.warn('Opportunity Won without unitId — accounting sync skipped', {
      opportunityId: result.id,
    });
    return;
  }

  try {
    const fact: WonOpportunityFact = {
      opportunityId: result.id,
      unitId,
      amount: typeof oppData.amount === 'number' ? oppData.amount : NaN,
      occurredAt: typeof oppData.closedAt === 'string' ? oppData.closedAt : new Date().toISOString(),
      label: typeof oppData.name === 'string' ? oppData.name : 'Oportunidade',
      accountRef: typeof oppData.accountId === 'string' ? oppData.accountId : undefined,
    };
    const scope = resolveAccountingScope(user, unitId);
    await getFactory().getCrmReceivableBridge().bookWonOpportunity(scope, fact);
  } catch (syncError) {
    logger.error('CRM→AR bridge (opportunity won) failed — left for reconciliation', {
      opportunityId: result.id,
      error: syncError instanceof Error ? syncError.message : String(syncError),
    });
  }
}

export const convertLeadToOpportunity = async (req: Request, res: Response) => {
  try {
    const user = getUserContextFromRequest(req);
    if (!user) throw new UnauthorizedError();
    const parsed = ConvertLeadToOpportunitySchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.flatten() });
    }
    const data = await getFactory().getCrmPipelineService().convertLeadToOpportunity(user, parsed.data);
    return res.status(201).json({ success: true, data });
  } catch (error) {
    return handleApiError(error, res);
  }
};

export const getCrmAnalytics = async (req: Request, res: Response) => {
  try {
    const user = getUserContextFromRequest(req);
    if (!user) throw new UnauthorizedError();
    const parsed = CrmAnalyticsQuerySchema.safeParse({
      datePreset: req.query.datePreset,
      timeZone: req.headers['x-user-timezone'],
    });
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.flatten() });
    }
    const data = await getFactory().getCrmAnalyticsService().getAnalytics(user, parsed.data);
    return res.json({ success: true, data });
  } catch (error) {
    return handleApiError(error, res);
  }
};
