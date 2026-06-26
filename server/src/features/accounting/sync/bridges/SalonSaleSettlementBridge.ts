/**
 * SalonSaleSettlementBridge — Incremento D / D1 integration seam (baixa de A Receber).
 *
 * Turns a Finalized + Paid salon sale (a DynamicTable `sales` row) into the settlement journal
 * entry via AccountingSync. It lives in the accounting (Prisma first-class) world and is invoked
 * POST-COMMIT from RegisterPaymentService (the pay transition) and from the DynamicTable controller
 * `create` handler (a sale born Finalized+Paid) — NEVER inside DynamicTableService, RuleContext or
 * a RulePlugin (§2.1 boundary). No accounting code crosses into features/dynamicTables.
 *
 * Mirrors maybeSyncSalonSaleFinalized (seam C): best-effort and non-fatal — a sync failure must
 * NOT undo the payment; the reconciliation pass re-drives it idempotently. Idempotency is
 * delegated entirely to PostingService (@@unique[userId,unitId,sourceType,sourceId]); this bridge
 * has NO idempotency pre-check (G3).
 *
 * ORDERING (revenue precedes settlement): the settlement clears A Receber, which only exists if
 * the revenue entry was booked. Before posting, the bridge confirms the 'salon.sale.finalized'
 * entry exists; if not, it does NOT settle (blocked_missing_revenue_entry) and leaves the sale for
 * reconcile to re-drive once the revenue is present. findEntryBySource only LOCATES the prerequisite
 * — it is not an idempotency check on the settlement itself.
 */

import { getFactory } from '../../../../lib/factory';
import logger from '../../../../lib/logger';
import { resolveAccountingScope } from '../../scope/AccountingScope';
import { buildSalonSaleSettledEvent } from '../AccountingSyncPort';
import { isAllPackageSale } from './salonSaleItems';

/** The minimal shape this bridge reads from a DynamicTable data row (create/update result). */
interface SaleRow {
  id: string;
  data?: unknown;
}

/**
 * If `row` is a Finalized + Paid sale in the BeautySalon `sales` table, book its settlement.
 * Returns silently (no throw) for every non-applicable case and swallows sync errors.
 *
 * @param actor   authenticated user context (owner === actor today; tenancy unchanged)
 * @param tableId the DynamicTable id the row belongs to (authoritative — from the caller)
 * @param row     the created/updated data row (id = saleId, data = the sale fields)
 */
export async function maybeSyncSalonSaleSettled(
  actor: { userId: string },
  tableId: string,
  row: SaleRow,
): Promise<void> {
  try {
    const data = (row.data ?? {}) as Record<string, unknown>;

    // Trigger gate (D1-Q1): settle ONLY a Finalized sale whose payment is Paid. Anything else
    // (still Pending, or not Finalized) is out of scope and never even hits the table lookup.
    if (data.status !== 'Finalized' || data.paymentStatus !== 'Paid') return;

    // Boundary gate (identical to seam C): confirm this tableId is THIS tenant's salon `sales`
    // table, without touching the DynamicTable engine — one indexed lookup by internalName, then
    // id + category match.
    const repo = getFactory().getDynamicTableRepository();
    const salesTable = await repo.findTableByInternalName(actor.userId, 'sales');
    if (!salesTable || salesTable.id !== tableId || salesTable.category !== 'finance') return;

    // Never default/infer the unit — only post within the sale's own unit (§2 tenancy).
    const unitId = typeof data.unitId === 'string' ? data.unitId : '';
    if (!unitId) {
      logger.warn('Salon sale settled without unitId — accounting sync skipped', { saleId: row.id });
      return;
    }

    // totalAmount must be a finite positive number. The mapper re-validates and converts to cents.
    const totalAmount = data.totalAmount;
    if (typeof totalAmount !== 'number' || !Number.isFinite(totalAmount) || totalAmount <= 0) {
      logger.warn('Salon sale settled with invalid totalAmount — accounting sync skipped', {
        saleId: row.id,
      });
      return;
    }

    // paymentMethod chooses the debit account in the mapper — a Paid sale without it cannot settle.
    const paymentMethod = typeof data.paymentMethod === 'string' ? data.paymentMethod : '';
    if (!paymentMethod) {
      logger.warn('Salon sale settled without paymentMethod — accounting sync skipped', {
        saleId: row.id,
      });
      return;
    }

    const scope = resolveAccountingScope(actor, unitId);

    // ORDERING GATE: the A Receber opening entry must exist before we clear it. For a normal sale
    // that is the revenue entry ('salon.sale.finalized'); for an all-Package sale it is the prepaid
    // origin ('salon.package.sold' — Incremento G P6), since an all-Package sale recognizes no
    // revenue. If the opening is missing, do NOT settle now — reconcile re-drives once it is booked.
    const openingSourceType = (await isAllPackageSale(actor.userId, row.id))
      ? 'salon.package.sold'
      : 'salon.sale.finalized';
    const opening = await getFactory()
      .getPostingService()
      .findEntryBySource(scope, openingSourceType, row.id);
    if (!opening) {
      logger.warn('Settlement blocked — A Receber opening entry missing (blocked_missing_opening_entry)', {
        saleId: row.id,
        openingSourceType,
      });
      return;
    }

    const event = buildSalonSaleSettledEvent({
      saleId: row.id,
      unitId,
      amount: totalAmount,
      currency: typeof data.currency === 'string' ? data.currency : 'BRL',
      // Date the settlement by paidAt (D1-Q2); fall back to the sale date, then now.
      occurredAt:
        typeof data.paidAt === 'string'
          ? data.paidAt
          : typeof data.date === 'string'
            ? data.date
            : new Date().toISOString(),
      paymentMethod,
      label: `Liquidação ${row.id}`,
    });
    await getFactory().getAccountingSyncService().sync(scope, event);
  } catch (syncError) {
    logger.error('AccountingSync (salon sale settled) failed — left for reconciliation', {
      saleId: row.id,
      error: syncError instanceof Error ? syncError.message : String(syncError),
    });
  }
}
