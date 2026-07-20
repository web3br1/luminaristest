/**
 * SalonSalesAccountingBridge — Incremento C integration seam (ADR-C01).
 *
 * Turns a finalized salon sale (a DynamicTable `sales` row) into a revenue journal
 * entry via AccountingSync. It lives in the accounting (Prisma first-class) world and
 * is invoked POST-COMMIT from the DynamicTable controller (create/update handlers) —
 * NEVER inside DynamicTableService, RuleContext or a RulePlugin (§2.1 boundary). No
 * accounting code crosses into features/dynamicTables; the dependency points one way.
 *
 * It mirrors crmController.maybeSyncOpportunityWon: best-effort and non-fatal — a sync
 * failure must NOT undo the finalized sale; the reconciliation job re-drives it
 * idempotently. Idempotency is delegated entirely to PostingService
 * (@@unique[userId,unitId,sourceType,sourceId]); this bridge has NO pre-check.
 */

import { getFactory } from '../../../../lib/factory';
import logger from '../../../../lib/logger';
import { resolveAccountingScope } from '../../scope/AccountingScope';
import { buildSalonSaleCogsEvent, buildSalonSaleFinalizedEvent } from '../AccountingSyncPort';
import { loadSalePackageInfo } from './salonSaleItems';
import type { AccountingScope } from '../../scope/AccountingScope';
import type { ProductLine } from './salonSaleItems';

/** The minimal shape this bridge reads from a DynamicTable data row (create/update result). */
interface SaleRow {
  id: string;
  data?: unknown;
}

/**
 * If `row` is a finalized sale in the BeautySalon `sales` table, book its revenue.
 * Returns silently (no throw) for every non-applicable case and swallows sync errors.
 *
 * @param actor  authenticated user context (owner === actor today; tenancy unchanged)
 * @param tableId the DynamicTable id the row was written to (from the route param)
 * @param row    the created/updated data row (id = saleId, data = the sale fields)
 */
export async function maybeSyncSalonSaleFinalized(
  actor: { userId: string },
  tableId: string,
  row: SaleRow,
): Promise<void> {
  try {
    const data = (row.data ?? {}) as Record<string, unknown>;

    // Trigger gate (ADR-C01): recognize revenue ONLY on Finalized. paymentStatus is
    // ignored. Cancelled/Returned are out of scope (Incremento D).
    if (data.status !== 'Finalized') return;

    // Boundary gate: confirm this tableId is THIS tenant's salon `sales` table, without
    // touching the DynamicTable engine — one indexed lookup by internalName, then id
    // match (so we never act on an unrelated table the user happens to own).
    const repo = getFactory().getDynamicTableRepository();
    const salesTable = await repo.findTableByInternalName(actor.userId, 'sales');
    if (!salesTable || salesTable.id !== tableId || salesTable.category !== 'finance') return;

    // Load + classify the sale's items ONCE: the anti-revenue gate needs the kind, the revenue
    // split needs the per-nature subtotals (ADR-INCR-REVENUE-SPLIT).
    const saleInfo = await loadSalePackageInfo(actor.userId, row.id);

    // Anti-revenue gate (Incremento G P4): an all-Package sale is PREPAID — selling it does
    // NOT recognize revenue. It books the obligation (C 2.1.1) via the package-sold bridge
    // instead. Proven from saleItems, never inferred from the header. Product/Service and mixed
    // sales fall through and book revenue normally.
    if (saleInfo.kind === 'Package') return;

    // Never default/infer the unit — only post within the sale's own unit (§2 tenancy).
    const unitId = typeof data.unitId === 'string' ? data.unitId : '';
    if (!unitId) {
      logger.warn('Salon sale Finalized without unitId — accounting sync skipped', {
        saleId: row.id,
      });
      return;
    }

    // totalAmount must be a finite positive number. The mapper re-validates and converts
    // to integer cents; guarding here keeps obviously-bad rows out of the error path.
    const totalAmount = data.totalAmount;
    if (typeof totalAmount !== 'number' || !Number.isFinite(totalAmount) || totalAmount <= 0) {
      logger.warn('Salon sale Finalized with invalid totalAmount — accounting sync skipped', {
        saleId: row.id,
      });
      return;
    }

    const currency = typeof data.currency === 'string' ? data.currency : 'BRL';
    const occurredAt = typeof data.date === 'string' ? data.date : new Date().toISOString();
    const event = buildSalonSaleFinalizedEvent({
      saleId: row.id,
      unitId,
      amount: totalAmount,
      currency,
      occurredAt,
      label: `Venda ${row.id}`,
      revenueByNature: saleInfo.revenueByNature,
    });
    const scope = resolveAccountingScope(actor, unitId);
    await getFactory().getAccountingSyncService().sync(scope, event);

    // SECOND emission (Body 2 / O-2): book the cost-of-goods for the sale's product lines. Runs
    // AFTER revenue succeeds, in its OWN try/catch — a CMV failure must NOT undo or re-drive the
    // already-posted revenue (the reconcile job re-drives CMV independently, idempotent by
    // read-first + @@unique). Only product lines carry COGS; a pure-service sale has none.
    await maybeSyncSalonSaleCogs(scope, row.id, unitId, currency, occurredAt, saleInfo.productLines);
  } catch (syncError) {
    const code = (syncError as { code?: string }).code;
    if (code === 'ACCOUNTING_PERIOD_NOT_OPEN') {
      logger.warn('AccountingSync skipped — período não está aberto', {
        saleId: row.id,
        error: syncError instanceof Error ? syncError.message : String(syncError),
      });
      return;
    }
    logger.error('AccountingSync (salon sale finalized) failed — left for reconciliation', {
      saleId: row.id,
      error: syncError instanceof Error ? syncError.message : String(syncError),
    });
  }
}

/**
 * Book the cost-of-goods (CMV) for a finalized sale's product lines (Body 2 / O-2). Runs the
 * subledger baixa (tx1, `InventoryService.recordSaleCogs` — moving-average, atomic CAS) and, if it
 * yields cost, emits `salon.sale.cogs` so `SalonSaleCogsMapper` posts the razão (tx2, D 4.2 / C
 * 1.1.6). SELF-CONTAINED try/catch and non-fatal: a CMV failure (insufficient stock, period closed,
 * posting down) is logged for the reconcile job and NEVER propagates to unwind the revenue entry
 * that already committed.
 *
 * No emission when there are no product lines (a pure-service sale) or the computed cost is 0.
 */
async function maybeSyncSalonSaleCogs(
  scope: AccountingScope,
  saleId: string,
  unitId: string,
  currency: string,
  occurredAt: string,
  productLines: ProductLine[],
): Promise<void> {
  if (productLines.length === 0) return;
  try {
    const { totalCogsCents } = await getFactory()
      .getInventoryService()
      .recordSaleCogs(scope, {
        saleId,
        unitId,
        occurredAt: new Date(occurredAt),
        lines: productLines,
      });
    if (totalCogsCents <= 0) return; // replay/zero cost → nothing to post.

    const cogsEvent = buildSalonSaleCogsEvent({
      saleId,
      unitId,
      costCents: totalCogsCents,
      currency,
      occurredAt,
      label: `CMV Venda ${saleId}`,
    });
    await getFactory().getAccountingSyncService().sync(scope, cogsEvent);
  } catch (cogsError) {
    const code = (cogsError as { code?: string }).code;
    if (code === 'ACCOUNTING_PERIOD_NOT_OPEN') {
      logger.warn('AccountingSync (CMV) skipped — período não está aberto', {
        saleId,
        error: cogsError instanceof Error ? cogsError.message : String(cogsError),
      });
      return;
    }
    logger.error('AccountingSync (salon sale CMV) failed — left for reconciliation', {
      saleId,
      error: cogsError instanceof Error ? cogsError.message : String(cogsError),
    });
  }
}
