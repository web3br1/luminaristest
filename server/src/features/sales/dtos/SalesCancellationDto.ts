import { z } from 'zod';

/**
 * SalesCancellationDto — inputs for the salon-sale cancellation / return transitions
 * (Incremento D). Both transitions move a `sales` row out of the `Finalized` terminal state
 * via a dedicated server-orchestrated service (isSystem write); the accounting effect is
 * applied POST-COMMIT by SalonSaleReversalBridge.
 *
 * `tableId` is the DynamicTable id of the salon `sales` table; the service re-asserts it
 * against the row's authoritative parent table (cross-tenant guard) before acting.
 */
export const CancelSaleSchema = z
  .object({
    tableId: z.string().min(1),
    saleId: z.string().min(1),
    reason: z.string().max(500).optional(),
  })
  .strict();

/** Returns share the exact input shape; kept as a distinct schema for OpenAPI/intent clarity. */
export const ReturnSaleSchema = CancelSaleSchema;

export type CancelSaleInput = z.infer<typeof CancelSaleSchema>;
export type ReturnSaleInput = z.infer<typeof ReturnSaleSchema>;

/** Type guard for CancelSaleInput. */
export function isCancelSaleInput(obj: unknown): obj is CancelSaleInput {
  return CancelSaleSchema.safeParse(obj).success;
}

/** Type guard for ReturnSaleInput. */
export function isReturnSaleInput(obj: unknown): obj is ReturnSaleInput {
  return ReturnSaleSchema.safeParse(obj).success;
}
