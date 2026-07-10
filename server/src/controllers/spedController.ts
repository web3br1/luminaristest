import type { Request, Response } from 'express';
import { getFactory } from '../lib/factory';
import { handleApiError } from '../lib/apiUtils';
import { getUserContextFromRequest } from '../lib/authUtils';
import { resolveAccountingScope } from '../features/accounting/scope/AccountingScope';
import { SpedEcdRequestSchema } from '../features/accounting/dtos/SpedEcdDto';

/**
 * POST /api/accounting/sped/ecd/generate — generate the SPED ECD (.txt) for a
 * year. Returns the export job summary; the artifact downloads via the existing
 * data-exchange job route (GET /data-exchange/jobs/:jobId/download). A coverage
 * gap surfaces as a 400 ValidationError with `unmappedAccounts` (D5).
 */
export const generateSpedEcd = async (req: Request, res: Response) => {
  try {
    const user = getUserContextFromRequest(req);
    if (!user) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const parsed = SpedEcdRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.flatten() });
    }

    const scope = resolveAccountingScope(user, parsed.data.unitId);
    const data = await getFactory().getSpedGenerationService().generate(scope, parsed.data);
    return res.status(201).json({ success: true, data });
  } catch (error) {
    return handleApiError(error, res);
  }
};
