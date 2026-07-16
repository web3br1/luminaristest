import type { Request, Response } from 'express';
import { getFactory } from '../lib/factory';
import { handleApiError } from '../lib/apiUtils';
import { getUserContextFromRequest } from '../lib/authUtils';
import { resolveAccountingScope } from '../features/accounting/scope/AccountingScope';
import {
  ArchiveCounterpartySchema,
  CounterpartyScopeQuerySchema,
  CreateCounterpartySchema,
  ListCounterpartiesQuerySchema,
} from '../features/accounting/dtos/CounterpartyDto';

/**
 * Contraparte (INCR-COUNTERPARTY / A1) HTTP edge. Thin controllers: auth → Zod safeParse → resolve
 * scope → delegate → handleApiError. Catalog changes are COMMANDS (create/archive), never a generic
 * PATCH. A counterparty is metadata (no money), so these endpoints never post to the ledger.
 */

/** GET /api/counterparties?unitId=&type=&includeArchived= — the catalog. */
export const listCounterparties = async (req: Request, res: Response) => {
  try {
    const user = getUserContextFromRequest(req);
    if (!user) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const parsed = ListCounterpartiesQuerySchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.flatten() });
    const scope = resolveAccountingScope(user, parsed.data.unitId);
    const data = await getFactory().getCounterpartyService().listCounterparties(scope, parsed.data);
    return res.json({ success: true, data });
  } catch (error) {
    return handleApiError(error, res);
  }
};

/** GET /api/counterparties/:id?unitId= — a single counterparty (scoped; cross-tenant → 404). */
export const getCounterparty = async (req: Request, res: Response) => {
  try {
    const user = getUserContextFromRequest(req);
    if (!user) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const parsed = CounterpartyScopeQuerySchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.flatten() });
    const scope = resolveAccountingScope(user, parsed.data.unitId);
    const data = await getFactory().getCounterpartyService().getCounterparty(scope, req.params.id);
    return res.json({ success: true, data });
  } catch (error) {
    return handleApiError(error, res);
  }
};

/** POST /api/counterparties — create a supplier/customer. */
export const createCounterparty = async (req: Request, res: Response) => {
  try {
    const user = getUserContextFromRequest(req);
    if (!user) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const parsed = CreateCounterpartySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.flatten() });
    const scope = resolveAccountingScope(user, parsed.data.unitId);
    const data = await getFactory().getCounterpartyService().createCounterparty(scope, parsed.data);
    return res.status(201).json({ success: true, data });
  } catch (error) {
    return handleApiError(error, res);
  }
};

/** POST /api/counterparties/:id/archive — soft-archive (rename-on-key frees the name). */
export const archiveCounterparty = async (req: Request, res: Response) => {
  try {
    const user = getUserContextFromRequest(req);
    if (!user) return res.status(401).json({ success: false, error: 'Unauthorized' });
    const parsed = ArchiveCounterpartySchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.flatten() });
    const scope = resolveAccountingScope(user, parsed.data.unitId);
    const data = await getFactory().getCounterpartyService().archiveCounterparty(scope, req.params.id, parsed.data);
    return res.json({ success: true, data });
  } catch (error) {
    return handleApiError(error, res);
  }
};
