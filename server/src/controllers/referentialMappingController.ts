import type { Request, Response } from 'express';
import { getFactory } from '../lib/factory';
import { handleApiError } from '../lib/apiUtils';
import { getUserContextFromRequest } from '../lib/authUtils';
import { resolveAccountingScope } from '../features/accounting/scope/AccountingScope';
import {
  SetReferentialMappingSchema,
  UnsetReferentialMappingSchema,
  ReferentialVersionQuerySchema,
  BatchSetReferentialMappingSchema,
  CopyReferentialMappingSchema,
} from '../features/accounting/dtos/ReferentialMappingDto';

/** PUT /api/accounting/referential/mappings — set (upsert) a referential mapping. */
export const setReferentialMapping = async (req: Request, res: Response) => {
  try {
    const user = getUserContextFromRequest(req);
    if (!user) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const parsed = SetReferentialMappingSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.flatten() });
    }
    const scope = resolveAccountingScope(user, parsed.data.unitId);
    const data = await getFactory().getReferentialMappingService().setMapping(scope, parsed.data);
    return res.json({ success: true, data });
  } catch (error) {
    return handleApiError(error, res);
  }
};

/** POST /api/accounting/referential/mappings/batch — atomic batch set (upsert) of many mappings. */
export const batchSetReferentialMappings = async (req: Request, res: Response) => {
  try {
    const user = getUserContextFromRequest(req);
    if (!user) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const parsed = BatchSetReferentialMappingSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.flatten() });
    }
    const scope = resolveAccountingScope(user, parsed.data.unitId);
    const data = await getFactory().getReferentialMappingService().batchSet(scope, parsed.data);
    return res.json({ success: true, data });
  } catch (error) {
    return handleApiError(error, res);
  }
};

/** POST /api/accounting/referential/mappings/copy — copy every mapping of a version into another. */
export const copyReferentialMappingVersion = async (req: Request, res: Response) => {
  try {
    const user = getUserContextFromRequest(req);
    if (!user) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const parsed = CopyReferentialMappingSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.flatten() });
    }
    const scope = resolveAccountingScope(user, parsed.data.unitId);
    const data = await getFactory().getReferentialMappingService().copyVersion(scope, parsed.data);
    return res.json({ success: true, data });
  } catch (error) {
    return handleApiError(error, res);
  }
};

/** GET /api/accounting/referential/skeleton?unitId&version — chart-driven authoring skeleton (unmapped leaves). */
export const getReferentialSkeleton = async (req: Request, res: Response) => {
  try {
    const user = getUserContextFromRequest(req);
    if (!user) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const parsed = ReferentialVersionQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.flatten() });
    }
    const scope = resolveAccountingScope(user, parsed.data.unitId);
    const data = await getFactory()
      .getReferentialMappingService()
      .authoringSkeleton(scope, parsed.data.version);
    return res.json({ success: true, data });
  } catch (error) {
    return handleApiError(error, res);
  }
};

/** DELETE /api/accounting/referential/mappings?unitId&accountId&mappingVersion — unset (hard-delete). */
export const unsetReferentialMapping = async (req: Request, res: Response) => {
  try {
    const user = getUserContextFromRequest(req);
    if (!user) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const parsed = UnsetReferentialMappingSchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.flatten() });
    }
    const scope = resolveAccountingScope(user, parsed.data.unitId);
    await getFactory().getReferentialMappingService().unsetMapping(scope, parsed.data);
    return res.json({
      success: true,
      data: { accountId: parsed.data.accountId, mappingVersion: parsed.data.mappingVersion },
    });
  } catch (error) {
    return handleApiError(error, res);
  }
};

/** GET /api/accounting/referential/mappings?unitId&version — list a version's mappings. */
export const listReferentialMappings = async (req: Request, res: Response) => {
  try {
    const user = getUserContextFromRequest(req);
    if (!user) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const parsed = ReferentialVersionQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.flatten() });
    }
    const scope = resolveAccountingScope(user, parsed.data.unitId);
    const data = await getFactory()
      .getReferentialMappingService()
      .listMappings(scope, parsed.data.version);
    return res.json({ success: true, data });
  } catch (error) {
    return handleApiError(error, res);
  }
};

/** GET /api/accounting/referential/coverage?unitId&version — ECD-readiness coverage diagnostic. */
export const getReferentialCoverage = async (req: Request, res: Response) => {
  try {
    const user = getUserContextFromRequest(req);
    if (!user) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const parsed = ReferentialVersionQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.flatten() });
    }
    const scope = resolveAccountingScope(user, parsed.data.unitId);
    const data = await getFactory()
      .getReferentialMappingService()
      .coverage(scope, parsed.data.version);
    return res.json({ success: true, data });
  } catch (error) {
    return handleApiError(error, res);
  }
};
