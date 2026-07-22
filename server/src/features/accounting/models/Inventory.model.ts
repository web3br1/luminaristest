/**
 * Inventory domain constants (Estoque — INCR-INVENTORY / ADR-INCR-INVENTORY). Small const file in
 * the style of `Payable.model.ts` / `ledgerStatus.ts`: the Prisma row types (`InventoryItem`,
 * `StockMovement`) come from `generated/prisma`; this file owns the enum-like unions and the
 * source-type discriminators that key `StockMovement` idempotency.
 */

/**
 * StockMovement kinds (the perpetual-inventory ledger, D1). `StockMovement` is APPEND-ONLY — every
 * valuation change is a new signed row, never an edit:
 *   - INBOUND    (+qty / +value) — a receipt: seed load or AP purchase (D3).
 *   - COGS       (−qty / −value) — a sale's cost-of-goods baixa at moving-average cost (D4).
 *   - ADJUSTMENT (±) — a manual/physical-count correction (reserved; not driven in Body 1).
 *   - REVERSAL   (+qty / +value) — a sale cancel/return, re-credited at the ORIGINAL baixa cost (D8).
 */
export const STOCK_MOVEMENT_KINDS = ['INBOUND', 'COGS', 'ADJUSTMENT', 'REVERSAL'] as const;
export type StockMovementKind = (typeof STOCK_MOVEMENT_KINDS)[number];

/** Lifecycle of an `InventoryItem` valuation row (soft-delete stays orthogonal via `deletedAt`). */
export const INVENTORY_ITEM_STATUSES = ['ACTIVE', 'ARCHIVED'] as const;
export type InventoryItemStatus = (typeof INVENTORY_ITEM_STATUSES)[number];

/**
 * Source-type discriminators for `StockMovement.sourceType` (idempotency key part, D-b). A COGS
 * baixa driven by a salon sale keys on the sale; an INBOUND keys on the receipt (payableId for an
 * AP purchase, a seed id for a manual load). These pair with `sourceId` to form the read-first
 * idempotency lookup (`findMovementBySource`) and the `@@unique([inventoryItemId,kind,sourceType,
 * sourceId])` backstop.
 */
export const INVENTORY_COGS_SOURCE_TYPE = 'salon.sale.cogs';
export const INVENTORY_INBOUND_SOURCE_TYPE = 'inventory.inbound';
