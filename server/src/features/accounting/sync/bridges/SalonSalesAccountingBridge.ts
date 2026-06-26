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
import { buildSalonSaleFinalizedEvent } from '../AccountingSyncPort';

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

    const event = buildSalonSaleFinalizedEvent({
      saleId: row.id,
      unitId,
      amount: totalAmount,
      currency: typeof data.currency === 'string' ? data.currency : 'BRL',
      occurredAt: typeof data.date === 'string' ? data.date : new Date().toISOString(),
      label: `Venda ${row.id}`,
    });
    const scope = resolveAccountingScope(actor, unitId);
    await getFactory().getAccountingSyncService().sync(scope, event);
  } catch (syncError) {
    logger.error('AccountingSync (salon sale finalized) failed — left for reconciliation', {
      saleId: row.id,
      error: syncError instanceof Error ? syncError.message : String(syncError),
    });
  }
}
