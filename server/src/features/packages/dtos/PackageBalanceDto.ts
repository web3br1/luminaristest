import { z } from 'zod';

/**
 * PackageBalanceDto — prepaid-package balance inputs (Incremento G).
 *
 * Money is INTEGER CENTS. The credit/debit amounts come from internal callers (the
 * package-sale bridge and RegisterPaymentService), validated in the service against the
 * money boundary; only the read endpoint takes HTTP query input, gated here.
 */

/** @openapi
 * components:
 *   schemas:
 *     ListPackageBalancesQuery:
 *       type: object
 *       required: [unitId]
 *       properties:
 *         unitId:     { type: string }
 *         customerId: { type: string }
 */
export const ListPackageBalancesQuerySchema = z.object({
  // unitId is the second tenancy axis (Contract §2): security boundary is userId (auth),
  // unitId is a user-owned sub-partition supplied by the request.
  unitId: z.string().min(1),
  customerId: z.string().min(1).optional(),
});

export type ListPackageBalancesQueryInput = z.infer<typeof ListPackageBalancesQuerySchema>;
