import { z } from 'zod';

/**
 * RegisterPaymentDto — input for the salon-sale payment transition (Incremento D / D1).
 *
 * This is the ONLY legitimate way to move a Finalized sale to paymentStatus='Paid': a dedicated
 * server-orchestrated service performs an isSystem write of a STRICT whitelist (paymentStatus,
 * paymentMethod, paidAt, paidByUserId, paymentReference). The settlement entry is booked POST-COMMIT
 * by SalonSaleSettlementBridge.
 *
 * `.strict()` is deliberate (trust boundary, G2): the request may carry ONLY these keys. Any attempt
 * to smuggle a frozen field (status/unitId/customerId/totalAmount/subtotal/discountAmount/taxAmount/
 * saleItems/date) is REJECTED here — never silently stripped — so the payload can never reach the
 * write path. `paidByUserId` is derived from the auth context, NOT accepted from the client.
 */

/** @openapi
 * components:
 *   schemas:
 *     RegisterPaymentInput:
 *       type: object
 *       required: [tableId, saleId, paymentMethod]
 *       properties:
 *         tableId:          { type: string }
 *         saleId:           { type: string }
 *         paymentMethod:    { type: string, enum: [Credit Card, Debit Card, Cash, Pix, Package Balance] }
 *         paidAt:           { type: string, description: "ISO datetime the payment occurred (settlement date). Defaults to now." }
 *         paymentReference: { type: string, description: "Optional external reference (NSU, transaction id…)." }
 */
export const RegisterPaymentSchema = z
  .object({
    tableId: z.string().min(1),
    saleId: z.string().min(1),
    // Mirrors SelectPresets.paymentMethod EXACTLY — the mapper rejects anything else anyway.
    paymentMethod: z.enum(['Credit Card', 'Debit Card', 'Cash', 'Pix', 'Package Balance']),
    paidAt: z.string().datetime().optional(),
    paymentReference: z.string().max(255).optional(),
  })
  .strict();

export type RegisterPaymentInput = z.infer<typeof RegisterPaymentSchema>;

/** Type guard for RegisterPaymentInput. */
export function isRegisterPaymentInput(obj: unknown): obj is RegisterPaymentInput {
  return RegisterPaymentSchema.safeParse(obj).success;
}
