import type { Request, Response } from 'express';
import { getFactory } from '../lib/factory';
import { handleApiError } from '../lib/apiUtils';
import { getUserContextFromRequest } from '../lib/authUtils';
import { resolveAccountingScope } from '../features/accounting/scope/AccountingScope';
import { CloseExerciseSchema } from '../features/accounting/dtos/ClosingDto';

/**
 * POST /api/accounting/closing/exercise — close the result of a fiscal year
 * (encerramento/apuração do resultado, BE-INCR-SPED-APURACAO). Posts a real balanced
 * closing entry that zeroes the result accounts against retained earnings; idempotent per
 * exercise. A 400 ValidationError surfaces when there is no result balance to close; the
 * period gate (dezembro OPEN) surfaces as its own error when the month is closed. Reopening
 * is done by reversing the returned entry via the existing POST /accounting/reverse (that
 * path frees the idempotency key so a fresh close produces a new entry).
 */
export const closeExercise = async (req: Request, res: Response) => {
  try {
    const user = getUserContextFromRequest(req);
    if (!user) return res.status(401).json({ success: false, error: 'Unauthorized' });

    const parsed = CloseExerciseSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.flatten() });
    }

    const scope = resolveAccountingScope(user, parsed.data.unitId);
    const data = await getFactory().getExerciseClosingService().closeExercise(scope, parsed.data.year);
    return res.status(201).json({ success: true, data });
  } catch (error) {
    return handleApiError(error, res);
  }
};
