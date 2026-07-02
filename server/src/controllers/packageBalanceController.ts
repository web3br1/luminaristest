import { Request, Response } from 'express';
import { getUserContextFromRequest } from '../lib/authUtils';
import { handleApiError } from '../lib/apiUtils';
import { UnauthorizedError } from '../lib/errors';
import { getFactory } from '../lib/factory';
import { resolveAccountingScope } from '../features/accounting/scope/AccountingScope';
import { ListPackageBalancesQuerySchema } from '../features/packages/dtos/PackageBalanceDto';

/**
 * Read-only listing of prepaid-package balances for a unit, optionally filtered to one
 * customer. Mutations (credit/debit) are driven internally by the package-sale bridge and
 * RegisterPaymentService — never exposed as a raw HTTP write.
 */
export const listPackageBalances = async (req: Request, res: Response) => {
  try {
    const user = getUserContextFromRequest(req);
    if (!user) throw new UnauthorizedError();
    const parsed = ListPackageBalancesQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      return res.status(400).json({ success: false, error: parsed.error.flatten() });
    }
    const scope = resolveAccountingScope(user, parsed.data.unitId);
    const balances = await getFactory()
      .getPackageBalanceService()
      .listBalances(scope, parsed.data.customerId);
    return res.json({ success: true, data: { balances } });
  } catch (error) {
    return handleApiError(error, res);
  }
};
