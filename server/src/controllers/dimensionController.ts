import type { Request, Response } from 'express';
import { getFactory } from '../lib/factory';
import { handleApiError } from '../lib/apiUtils';
import { getUserContextFromRequest } from '../lib/authUtils';
import { resolveAccountingScope } from '../features/accounting/scope/AccountingScope';
import {
  ArchiveDimensionSchema,
  CreateDimensionDefinitionSchema,
  CreateDimensionValueSchema,
  DimensionReportQuerySchema,
  ListDimensionsQuerySchema,
} from '../features/accounting/dtos/DimensionDto';

/**
 * Dimensões (INCR-DIM) HTTP edge. Thin controllers: auth → Zod safeParse → resolve scope → delegate →
 * handleApiError. Catalog changes are COMMANDS (create/archive), never a generic PATCH (ACC-016). A
 * dimension is metadata orthogonal to the ledger (ACC-024) — these endpoints never post money.
 */

// ── Catalog ────────────────────────────────────────────────────────────────
/** GET /api/dimensions?unitId=&includeArchived= — the catalog (definitions + their values). */
export const listDimensions = async (req: Request, res: Response) => {
  try {
    const user = getUserContextFromRequest(req);
    if (!user) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const parsed = ListDimensionsQuerySchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.flatten() });
    const scope = resolveAccountingScope(user, parsed.data.unitId);
    const data = await getFactory().getDimensionService().listCatalog(scope, parsed.data);
    return res.json({ success: true, data });
  } catch (error) {
    return handleApiError(error, res);
  }
};

/** POST /api/dimensions/definitions — create a dimension axis (cost center, project…). */
export const createDefinition = async (req: Request, res: Response) => {
  try {
    const user = getUserContextFromRequest(req);
    if (!user) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const parsed = CreateDimensionDefinitionSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.flatten() });
    const scope = resolveAccountingScope(user, parsed.data.unitId);
    const data = await getFactory().getDimensionService().createDefinition(scope, parsed.data);
    return res.status(201).json({ success: true, data });
  } catch (error) {
    return handleApiError(error, res);
  }
};

/** POST /api/dimensions/definitions/:id/archive — archive an axis (its values must be archived first). */
export const archiveDefinition = async (req: Request, res: Response) => {
  try {
    const user = getUserContextFromRequest(req);
    if (!user) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const parsed = ArchiveDimensionSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.flatten() });
    const scope = resolveAccountingScope(user, parsed.data.unitId);
    const data = await getFactory().getDimensionService().archiveDefinition(scope, req.params.id, parsed.data);
    return res.json({ success: true, data });
  } catch (error) {
    return handleApiError(error, res);
  }
};

/** POST /api/dimensions/values — create a value in an axis (optional rollup parent, same axis). */
export const createValue = async (req: Request, res: Response) => {
  try {
    const user = getUserContextFromRequest(req);
    if (!user) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const parsed = CreateDimensionValueSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.flatten() });
    const scope = resolveAccountingScope(user, parsed.data.unitId);
    const data = await getFactory().getDimensionService().createValue(scope, parsed.data);
    return res.status(201).json({ success: true, data });
  } catch (error) {
    return handleApiError(error, res);
  }
};

/** POST /api/dimensions/values/:id/archive — archive a value (its children must be archived first). */
export const archiveValue = async (req: Request, res: Response) => {
  try {
    const user = getUserContextFromRequest(req);
    if (!user) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const parsed = ArchiveDimensionSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.flatten() });
    const scope = resolveAccountingScope(user, parsed.data.unitId);
    const data = await getFactory().getDimensionService().archiveValue(scope, req.params.id, parsed.data);
    return res.json({ success: true, data });
  } catch (error) {
    return handleApiError(error, res);
  }
};

// ── Reports (Fatia 3) ────────────────────────────────────────────────────────
/** GET /api/dimensions/reports/balance?unitId=&definitionId=&from=&to= — balancete by dimension. */
export const balanceByDimension = async (req: Request, res: Response) => {
  try {
    const user = getUserContextFromRequest(req);
    if (!user) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const parsed = DimensionReportQuerySchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.flatten() });
    const scope = resolveAccountingScope(user, parsed.data.unitId);
    const data = await getFactory().getDimensionReportService().balanceByDimension(scope, parsed.data);
    return res.json({ success: true, data });
  } catch (error) {
    return handleApiError(error, res);
  }
};

/** GET /api/dimensions/reports/result?unitId=&definitionId=&from=&to= — DRE by dimension. */
export const resultByDimension = async (req: Request, res: Response) => {
  try {
    const user = getUserContextFromRequest(req);
    if (!user) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const parsed = DimensionReportQuerySchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.flatten() });
    const scope = resolveAccountingScope(user, parsed.data.unitId);
    const data = await getFactory().getDimensionReportService().resultByDimension(scope, parsed.data);
    return res.json({ success: true, data });
  } catch (error) {
    return handleApiError(error, res);
  }
};
