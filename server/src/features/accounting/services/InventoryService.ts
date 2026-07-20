import { ForbiddenError, NotFoundError, ValidationError } from '../../../lib/errors';
import logger from '../../../lib/logger';
import { Prisma } from 'generated/prisma';
import type { InventoryItem } from 'generated/prisma';
import { MAX_CENTS } from '../models/money';
import {
  INVENTORY_COGS_SOURCE_TYPE,
  INVENTORY_INBOUND_SOURCE_TYPE,
} from '../models/Inventory.model';
import type { IInventoryRepository } from '../repositories/IInventoryRepository';
import type { IAccountRepository } from '../repositories/IAccountRepository';
import type { IAccountingPolicy } from '../policies/IAccountingPolicy';
import type { AuditService } from './AuditService';
import type { PostingService } from './PostingService';
import type { AccountingScope } from '../scope/AccountingScope';
import { accountingScopeWhere } from '../scope/AccountingScope';

/** A receipt of stock (INBOUND). `totalValueCents` is the TOTAL cost of `qty` units (not per-unit)
 *  so the moving average never crosses a float boundary (D5/D6). */
export interface ReceiveStockParams {
  productRef: string;
  qty: number;
  totalValueCents: number;
  occurredAt: Date;
  sourceType: string;
  sourceId: string;
  description?: string | null;
}

/** One line of a sale to book cost-of-goods for. */
export interface SaleCostLine {
  productRef: string;
  qty: number;
}

export interface RecordSaleCogsParams {
  saleId: string;
  unitId: string;
  occurredAt: Date;
  lines: SaleCostLine[];
}

export interface ReverseStockForSaleParams {
  saleId: string;
  reversalEventId: string;
  reversalDate: Date;
}

/**
 * InventoryService — perpetual inventory subledger (INCR-INVENTORY / ADR-INCR-INVENTORY). FIRST-CLASS
 * PRISMA, SUBLEDGER-ONLY.
 *
 * This service owns ONLY the subledger (`InventoryItem` valuation + append-only `StockMovement`); it
 * NEVER posts to the ledger. The CMV/razão leg is booked by the `SalonSaleCogsMapper` at the
 * post-commit seam (Body 2, O-2 reconciliation) — `recordSaleCogs` runs tx1 (the CAS baixa, returns
 * the cents) and the mapper runs tx2 (the `D 4.2 / C 1.1.6` post). Because postEntry opens its OWN
 * root tx (SQLite has no nesting), the subledger baixa and the ledger post are DIFFERENT commits —
 * the same crash window as AP; convergence is the read-first idempotency below + `reconcileInventory`
 * / the reconcile job re-drive.
 *
 * Load-bearing invariants:
 * - Moving average is DERIVED `totalValueCents ÷ qtyOnHand` in-tx, never a persisted per-unit float
 *   (D6). Every baixa's `valueDelta = round(totalValueCents × qty / qtyOnHand)` with the residue
 *   absorbed, and the snapshot decrement equals the movement's `valueCentsDelta` in the SAME tx — so
 *   the tie-out Σ`StockMovement.valueCentsDelta` == `InventoryItem.totalValueCents` holds by
 *   construction (Gate 2/D6).
 * - Concurrent baixas of one SKU serialize on the atomic `decrementForCogs` CAS (`where qtyOnHand ≥
 *   qty`, count===1 wins); `qtyOnHand` never goes negative (D4/Gate 1).
 * - READ-FIRST idempotency (Gap 3): a replay of the same `sourceId` finds the existing movement and
 *   returns its cents WITHOUT a second decrement/increment; the `@@unique` is only the backstop.
 * - Estorno re-credits at the ORIGINAL baixa cost read off the original COGS movement, never the
 *   current average (D8/Gate 6); `sourceId` = the reversal event id, distinct from the baixa key.
 *
 * `accountRepo`/`posting` are injected for parity with the AP/AR services and the factory wiring
 * (plan A1-5): the subledger-only body does not use them, but the constructor arity is fixed so the
 * ledger-adjacent seam (mapper/reconcile) attaches without a signature change.
 */
export class InventoryService {
  constructor(
    private readonly inventoryRepo: IInventoryRepository,
    private readonly accountRepo: IAccountRepository,
    private readonly posting: PostingService,
    private readonly auditService: AuditService,
    private readonly policy: IAccountingPolicy,
  ) {}

  // ---------------------------------------------------------------------------
  // Reads
  // ---------------------------------------------------------------------------

  async listInventory(
    scope: AccountingScope,
    params: { status?: string; page: number; limit: number },
  ): Promise<{ items: InventoryItem[]; total: number }> {
    if (!this.policy.canReadInventory(scope)) {
      throw new ForbiddenError('Você não tem permissão para listar o estoque.');
    }
    const skip = (params.page - 1) * params.limit;
    return this.inventoryRepo.findManyByUnit(scope, { status: params.status, skip, limit: params.limit });
  }

  async getInventoryItem(scope: AccountingScope, id: string): Promise<InventoryItem> {
    if (!this.policy.canReadInventory(scope)) {
      throw new ForbiddenError('Você não tem permissão para ler o estoque.');
    }
    const item = await this.inventoryRepo.findById(scope, id);
    if (!item) throw new NotFoundError(`Item de estoque '${id}' não foi encontrado.`);
    return item;
  }

  // ---------------------------------------------------------------------------
  // Receive stock (INBOUND) — seed manual or AP purchase bridge (D3)
  // ---------------------------------------------------------------------------

  /**
   * Receive stock at cost: recompute the moving average in-tx (`totalValueCents += totalValueCents;
   * qtyOnHand += qty`) and append an INBOUND movement. READ-FIRST idempotent (Gap 3): if a movement
   * for this (item, INBOUND, sourceType, sourceId) already exists, return its existing cents WITHOUT
   * mutating — so the same purchase entering via the AP bridge and a seed of the same lot values the
   * SKU exactly once (Gate 4). Returns the valued cents actually booked (existing on replay).
   */
  async receiveStock(scope: AccountingScope, params: ReceiveStockParams): Promise<{ valueCents: number }> {
    if (!this.policy.canManageInventory(scope)) {
      throw new ForbiddenError('Você não tem permissão para movimentar estoque.');
    }
    this.assertQty(params.qty);
    this.assertCents(params.totalValueCents);

    // Ensure the valuation row exists (its OWN tx — a P2002 from a concurrent first-receipt of the
    // same product cannot abort the idempotency+increment tx below). @@unique(userId,unitId,
    // productRef) is the anchor (D-a).
    const item = await this.ensureItem(scope, params.productRef, params.description ?? null);

    return this.inventoryRepo.runTransaction(async (tx) => {
      const existing = await this.inventoryRepo.findMovementBySource(
        scope,
        { inventoryItemId: item.id, kind: 'INBOUND', sourceType: params.sourceType, sourceId: params.sourceId },
        tx,
      );
      if (existing) {
        // Replay — do NOT mutate; return the cents already booked (Gap 3).
        return { valueCents: existing.valueCentsDelta };
      }

      const applied = await this.inventoryRepo.incrementForInbound(
        scope,
        item.id,
        params.qty,
        params.totalValueCents,
        tx,
      );
      if (applied !== 1) {
        throw new ValidationError('Item de estoque não está disponível para recebimento.');
      }

      await this.inventoryRepo.createMovement(
        {
          inventoryItemId: item.id,
          kind: 'INBOUND',
          qtyDelta: params.qty,
          valueCentsDelta: params.totalValueCents,
          occurredAt: params.occurredAt,
          sourceType: params.sourceType,
          sourceId: params.sourceId,
          entryId: null,
        },
        tx,
      );

      await this.auditService.append(tx, scope, {
        actorUserId: scope.actorUserId,
        eventType: 'inventory.received',
        targetType: 'inventory_item',
        targetId: item.id,
        payload: {
          inventoryItemId: item.id,
          productRef: params.productRef,
          qty: params.qty,
          valueCents: String(params.totalValueCents),
          sourceType: params.sourceType,
          sourceId: params.sourceId,
        },
      });

      return { valueCents: params.totalValueCents };
    });
  }

  // ---------------------------------------------------------------------------
  // Record CMV baixa on a sale (tx1 — subledger only; the razão is the mapper's, O-2)
  // ---------------------------------------------------------------------------

  /**
   * Book cost-of-goods for a finalized sale: per product, baixa the stock at the current moving
   * average via the atomic CAS and append a COGS movement. Does NOT post the ledger — returns the
   * total CMV cents for the `SalonSaleCogsMapper` to book `D 4.2 / C 1.1.6` (Body 2).
   *
   * Per-line READ-FIRST idempotency (Gap 3 / Gate 5): a replay of the same `saleId` finds each COGS
   * movement and reuses its cents WITHOUT a second decrement — even a PARTIAL replay (some lines
   * applied before a crash) completes cleanly. Lines are aggregated by productRef first so a
   * multi-line same-product sale yields ONE movement per item (the @@unique is per item×sale).
   */
  async recordSaleCogs(
    scope: AccountingScope,
    params: RecordSaleCogsParams,
  ): Promise<{ totalCogsCents: number }> {
    if (!this.policy.canManageInventory(scope)) {
      throw new ForbiddenError('Você não tem permissão para baixar estoque.');
    }

    const perProduct = this.aggregateLines(params.lines);
    if (perProduct.size === 0) return { totalCogsCents: 0 };

    return this.inventoryRepo.runTransaction(async (tx) => {
      let totalCogsCents = 0;
      for (const [productRef, qty] of perProduct) {
        const item = await this.inventoryRepo.findByProductRef(scope, productRef, tx);
        if (!item) {
          throw new ValidationError(`Estoque insuficiente: produto '${productRef}' não tem estoque valorado.`);
        }

        const existing = await this.inventoryRepo.findMovementBySource(
          scope,
          { inventoryItemId: item.id, kind: 'COGS', sourceType: INVENTORY_COGS_SOURCE_TYPE, sourceId: params.saleId },
          tx,
        );
        if (existing) {
          // Replay of this line — reuse the cents already booked, no second decrement (Gap 3).
          totalCogsCents += -existing.valueCentsDelta;
          continue;
        }

        if (item.qtyOnHand < qty || item.qtyOnHand <= 0) {
          throw new ValidationError(`Estoque insuficiente para o produto '${productRef}'.`);
        }
        // Moving average derived in-tx; residue absorbed (D6). Never a persisted per-unit float.
        const valueDelta = Math.round((item.totalValueCents * qty) / item.qtyOnHand);

        // Atomic CAS (D4): decrement qty+value ONLY if enough stock. count===1 wins; a loser (or a
        // concurrent baixa that drained the SKU) gets 0 and is rejected — qtyOnHand never negative.
        const won = await this.inventoryRepo.decrementForCogs(scope, item.id, qty, valueDelta, tx);
        if (won !== 1) {
          throw new ValidationError(`Estoque insuficiente para o produto '${productRef}'.`);
        }

        await this.inventoryRepo.createMovement(
          {
            inventoryItemId: item.id,
            kind: 'COGS',
            qtyDelta: -qty,
            valueCentsDelta: -valueDelta,
            occurredAt: params.occurredAt,
            sourceType: INVENTORY_COGS_SOURCE_TYPE,
            sourceId: params.saleId,
            entryId: null,
          },
          tx,
        );
        totalCogsCents += valueDelta;
      }
      return { totalCogsCents };
    });
  }

  // ---------------------------------------------------------------------------
  // Reverse stock for a cancelled/returned sale (D8) — re-credit at ORIGINAL cost
  // ---------------------------------------------------------------------------

  /**
   * Re-credit the stock a sale had baixa'd, at the ORIGINAL baixa cost read off each original COGS
   * movement (NOT the current average, which may have moved, D8/Gate 6). Idempotent by
   * `reversalEventId` (distinct from the baixa's `saleId` key — class of APURACAO D5). Returns the
   * total cents re-credited.
   */
  async reverseStockForSale(
    scope: AccountingScope,
    params: ReverseStockForSaleParams,
  ): Promise<{ totalReversedCents: number }> {
    if (!this.policy.canManageInventory(scope)) {
      throw new ForbiddenError('Você não tem permissão para estornar estoque.');
    }

    return this.inventoryRepo.runTransaction(async (tx) => {
      const originals = await this.inventoryRepo.findMovementsBySource(
        scope,
        { kind: 'COGS', sourceType: INVENTORY_COGS_SOURCE_TYPE, sourceId: params.saleId },
        tx,
      );

      let totalReversedCents = 0;
      let mutated = false;
      for (const original of originals) {
        const existing = await this.inventoryRepo.findMovementBySource(
          scope,
          {
            inventoryItemId: original.inventoryItemId,
            kind: 'REVERSAL',
            sourceType: INVENTORY_COGS_SOURCE_TYPE,
            sourceId: params.reversalEventId,
          },
          tx,
        );
        if (existing) {
          totalReversedCents += existing.valueCentsDelta;
          continue;
        }

        // Invert the ORIGINAL deltas (original COGS is −qty / −value).
        const qtyBack = -original.qtyDelta;
        const valueBack = -original.valueCentsDelta;

        const applied = await this.inventoryRepo.incrementForInbound(
          scope,
          original.inventoryItemId,
          qtyBack,
          valueBack,
          tx,
        );
        if (applied !== 1) {
          throw new ValidationError('Item de estoque não está disponível para estorno.');
        }

        await this.inventoryRepo.createMovement(
          {
            inventoryItemId: original.inventoryItemId,
            kind: 'REVERSAL',
            qtyDelta: qtyBack,
            valueCentsDelta: valueBack,
            occurredAt: params.reversalDate,
            sourceType: INVENTORY_COGS_SOURCE_TYPE,
            sourceId: params.reversalEventId,
            entryId: null,
          },
          tx,
        );
        totalReversedCents += valueBack;
        mutated = true;
      }

      if (mutated) {
        await this.auditService.append(tx, scope, {
          actorUserId: scope.actorUserId,
          eventType: 'inventory.reversed',
          targetType: 'inventory_sale',
          targetId: params.saleId,
          payload: {
            saleId: params.saleId,
            reversalEventId: params.reversalEventId,
            valueCents: String(totalReversedCents),
          },
        });
      }

      return { totalReversedCents };
    });
  }

  // ---------------------------------------------------------------------------
  // Reconcile (tie-out safety net — D6/Gate 2)
  // ---------------------------------------------------------------------------

  /**
   * Re-drive the item snapshot from its append-only movement log: recompute `qtyOnHand` /
   * `totalValueCents` as Σ of the movements and repair any drift. In normal operation the snapshot
   * update and the movement append share a tx, so drift is impossible and this is a no-op — it is the
   * belt-and-suspenders that PROVES the tie-out Σ`valueCentsDelta` == `totalValueCents` (D6). Best
   * effort per item: one failing item does not abort the pass.
   */
  async reconcileInventory(
    scope: AccountingScope,
  ): Promise<{ itemsChecked: number; itemsRepaired: number }> {
    if (!this.policy.canManageInventory(scope)) {
      throw new ForbiddenError('Você não tem permissão para reconciliar o estoque.');
    }
    let itemsChecked = 0;
    let itemsRepaired = 0;

    const items = await this.inventoryRepo.findAllActive(scope);
    for (const item of items) {
      itemsChecked += 1;
      try {
        const movements = await this.inventoryRepo.findMovementsByItem(scope, item.id);
        const sumQty = movements.reduce((acc, m) => acc + m.qtyDelta, 0);
        const sumValue = movements.reduce((acc, m) => acc + m.valueCentsDelta, 0);
        if (sumQty !== item.qtyOnHand || sumValue !== item.totalValueCents) {
          await this.inventoryRepo.updateItem(scope, item.id, {
            qtyOnHand: sumQty,
            totalValueCents: sumValue,
          });
          itemsRepaired += 1;
          logger.warn('Inventory reconcile: snapshot drift repaired from movement log', {
            inventoryItemId: item.id,
            sumQty,
            sumValue,
          });
        }
      } catch (error) {
        logger.warn('Inventory reconcile: item re-drive failed', { inventoryItemId: item.id, error });
      }
    }

    logger.info('Inventory reconcile pass complete', { itemsChecked, itemsRepaired });
    return { itemsChecked, itemsRepaired };
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /** Sum qty per productRef so a multi-line same-product sale books ONE COGS movement per item. */
  private aggregateLines(lines: SaleCostLine[]): Map<string, number> {
    const perProduct = new Map<string, number>();
    for (const line of lines) {
      this.assertQty(line.qty);
      perProduct.set(line.productRef, (perProduct.get(line.productRef) ?? 0) + line.qty);
    }
    return perProduct;
  }

  /**
   * Return the live valuation row for a product, creating an empty one (qty 0 / value 0) if none
   * exists. Runs in its OWN write so a P2002 from a concurrent first-receipt does not abort the
   * caller's idempotency tx: on the race the loser re-reads the row the winner created.
   */
  private async ensureItem(
    scope: AccountingScope,
    productRef: string,
    description: string | null,
  ): Promise<InventoryItem> {
    const existing = await this.inventoryRepo.findByProductRef(scope, productRef);
    if (existing) return existing;

    const { userId, unitId } = accountingScopeWhere(scope);
    try {
      return await this.inventoryRepo.create({
        userId,
        unitId,
        productRef,
        description,
        qtyOnHand: 0,
        totalValueCents: 0,
        status: 'ACTIVE',
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const now = await this.inventoryRepo.findByProductRef(scope, productRef);
        if (now) return now;
      }
      throw error;
    }
  }

  private assertQty(qty: number): void {
    if (!Number.isSafeInteger(qty) || qty <= 0) {
      throw new ValidationError('A quantidade deve ser um inteiro positivo.');
    }
  }

  private assertCents(cents: number): void {
    if (!Number.isSafeInteger(cents) || cents < 0 || cents > MAX_CENTS) {
      throw new ValidationError(`O valor em centavos deve ser um inteiro entre 0 e ${MAX_CENTS}.`);
    }
  }
}
