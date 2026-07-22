import type { InventoryItem, StockMovement, Prisma } from 'generated/prisma';
import type { AccountingScope } from '../scope/AccountingScope';

/** Data to create an `InventoryItem` valuation row. Scalars only (no relation objects). */
export interface CreateInventoryItemData {
  userId: string;
  unitId: string;
  productRef: string;
  description: string | null;
  qtyOnHand: number;
  totalValueCents: number;
  status: string;
}

/** Data to append a `StockMovement` (append-only ledger row). */
export interface CreateStockMovementData {
  inventoryItemId: string;
  kind: string;
  qtyDelta: number;
  valueCentsDelta: number;
  occurredAt: Date;
  sourceType: string;
  sourceId: string;
  entryId: string | null;
}

/** Criteria for the read-first idempotency lookup of a single movement (Gap 3, D-b). */
export interface MovementSourceKey {
  inventoryItemId: string;
  kind: string;
  sourceType: string;
  sourceId: string;
}

/** Criteria for enumerating every movement that shares an origin (reverse D8; scoped via parent). */
export interface MovementSourceQuery {
  kind: string;
  sourceType: string;
  sourceId: string;
}

/**
 * Repository contract for the perpetual inventory subledger (`inventory_items` + `stock_movements`).
 * The ONLY place with `prisma.inventoryItem.*` / `prisma.stockMovement.*` access. Two-level tenancy
 * via AccountingScope (ownerUserId + unitId). Every method takes an optional `tx` so the service can
 * propagate the transaction (ACC-012).
 *
 * Two atomic conditional writes carry the load-bearing invariants (SQLite serializes writers, so an
 * `updateMany … where` is the correct CAS, mirroring PayableRepository.claimForPayment):
 *   - `decrementForCogs` — `updateMany where qtyOnHand >= qty` → count; count===1 wins the TOCTOU on
 *     a concurrent SKU sale, `qtyOnHand` can never go negative (D4).
 *   - `incrementForInbound` — the atomic +qty/+value applied by a receipt or a reversal re-credit.
 *
 * `InventoryItem` soft-deletes (reads filter `deletedAt: null`); `StockMovement` is append-only (no
 * update/delete path).
 */
export interface IInventoryRepository {
  create(data: CreateInventoryItemData, tx?: Prisma.TransactionClient): Promise<InventoryItem>;

  /** The single live valuation row for a product×unit (the @@unique anchor of the upsert/CAS, D-a). */
  findByProductRef(
    scope: AccountingScope,
    productRef: string,
    tx?: Prisma.TransactionClient,
  ): Promise<InventoryItem | null>;

  findById(
    scope: AccountingScope,
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<InventoryItem | null>;

  findManyByUnit(
    scope: AccountingScope,
    params: { status?: string; skip: number; limit: number },
  ): Promise<{ items: InventoryItem[]; total: number }>;

  /** Every non-deleted item in scope (reconcile tie-out re-drive input). */
  findAllActive(scope: AccountingScope, tx?: Prisma.TransactionClient): Promise<InventoryItem[]>;

  updateItem(
    scope: AccountingScope,
    id: string,
    data: Prisma.InventoryItemUpdateInput,
    tx?: Prisma.TransactionClient,
  ): Promise<InventoryItem>;

  createMovement(
    data: CreateStockMovementData,
    tx?: Prisma.TransactionClient,
  ): Promise<StockMovement>;

  /**
   * Read-first idempotency lookup (Gap 3): the movement for an (item, kind, sourceType, sourceId)
   * if it already exists, else null. Lets `receiveStock`/`recordSaleCogs`/`reverseStockForSale`
   * return the existing cents WITHOUT mutating on replay — the `@@unique` is only the backstop.
   */
  findMovementBySource(
    scope: AccountingScope,
    key: MovementSourceKey,
    tx?: Prisma.TransactionClient,
  ): Promise<StockMovement | null>;

  /** Every movement that shares an origin (kind+sourceType+sourceId) across items, scope-guarded
   *  through the parent item — drives the estorno of a multi-item sale (D8). */
  findMovementsBySource(
    scope: AccountingScope,
    query: MovementSourceQuery,
    tx?: Prisma.TransactionClient,
  ): Promise<StockMovement[]>;

  /** Every movement of one item, oldest-first — the reconcile tie-out recompute (D6/Gate 2). */
  findMovementsByItem(
    scope: AccountingScope,
    inventoryItemId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<StockMovement[]>;

  /**
   * Atomic CAS baixa (D4): `updateMany where qtyOnHand >= qty` decrements qty and value in ONE
   * write. Returns the row count (1 = won the race and had enough stock, 0 = insufficient / lost).
   * The ONLY correct place to serialize concurrent baixas of the same SKU — `qtyOnHand` never goes
   * negative because the `where` gates it.
   */
  decrementForCogs(
    scope: AccountingScope,
    inventoryItemId: string,
    qty: number,
    valueCentsDelta: number,
    tx?: Prisma.TransactionClient,
  ): Promise<number>;

  /** Atomic +qty/+value applied by an INBOUND or a REVERSAL re-credit. Returns the row count. */
  incrementForInbound(
    scope: AccountingScope,
    inventoryItemId: string,
    qty: number,
    valueCentsDelta: number,
    tx?: Prisma.TransactionClient,
  ): Promise<number>;

  runTransaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T>;
}
