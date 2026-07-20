import { z } from 'zod';
import { MAX_CENTS } from '../models/money';
import { isValidDateOnly } from '../models/dates';
import { INVENTORY_ITEM_STATUSES } from '../models/Inventory.model';

/**
 * InventoryDto — Estoque (INCR-INVENTORY) request schemas. Mirror of `PayableDto.ts`. Money is
 * INTEGER CENTS guarded by `MAX_CENTS` (the Int32 persistence ceiling shared with the ledger,
 * D5/ACC-014); dates are date-only validated by `isValidDateOnly` (regex + round-trip). Every
 * schema is `.strict()` so a typo'd field fails loud instead of being silently dropped.
 *
 * Valuation is booked in cents (`totalValueCents` = the TOTAL valued cost of the receipt — the
 * moving average is derived `totalValueCents ÷ qtyOnHand` in-tx, never a per-unit float, D6). There
 * is NO HTTP surface this increment (F-INV2 deferred): these schemas validate the seed/import
 * entry-point and lock the shape the future controller will reuse.
 */

const cents = z
  .number()
  .int()
  .nonnegative()
  .max(MAX_CENTS, { message: `totalValueCents excede o limite suportado (máx ${MAX_CENTS}).` });

const qty = z.number().int().positive();

const dateOnly = (field: string) =>
  z.string().refine(isValidDateOnly, `${field} deve ser uma data real YYYY-MM-DD`);

/**
 * Manual/seed receipt of stock (INBOUND). `totalValueCents` is the TOTAL cost of `qty` units (not
 * per-unit) so the moving average never crosses a float boundary. The service defaults `sourceType`
 * to `inventory.inbound`; the AP purchase bridge (Body 3) calls the service directly with its own
 * `sourceType`/`sourceId`, never through this schema.
 */
export const ReceiveStockSchema = z
  .object({
    unitId: z.string().min(1),
    productRef: z.string().min(1),
    description: z.string().min(1).optional(),
    qty,
    totalValueCents: cents,
    occurredAt: dateOnly('occurredAt'),
    sourceId: z.string().min(1).optional(),
  })
  .strict();

/** List DTO for the inventory items of a unit (reads only, F-INV2 deferred surface). */
export const ListInventoryQuerySchema = z.object({
  unitId: z.string().min(1),
  status: z.enum(INVENTORY_ITEM_STATUSES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

/** Query DTO for a single inventory item — unitId required (scope key). */
export const InventoryScopeQuerySchema = z.object({
  unitId: z.string().min(1),
});

export type ReceiveStockInput = z.infer<typeof ReceiveStockSchema>;
export type ListInventoryQueryInput = z.infer<typeof ListInventoryQuerySchema>;
export type InventoryScopeQueryInput = z.infer<typeof InventoryScopeQuerySchema>;
