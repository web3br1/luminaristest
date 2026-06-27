/**
 * SalonSaleReversalBridge — Incremento D integration seam (estorno/devolução).
 *
 * Turns a Cancelled or Returned salon sale (a DynamicTable `sales` row) into the matching
 * accounting effect. It lives in the accounting (Prisma first-class) world and is invoked
 * POST-COMMIT from SalesCancellationService — NEVER inside DynamicTableService, RuleContext
 * or a RulePlugin (§2.1 boundary). No accounting code crosses into features/dynamicTables;
 * the dependency points one way.
 *
 * Mirrors maybeSyncSalonSaleFinalized (seam C): best-effort and non-fatal — a failure must
 * NOT undo the cancellation/return; the reconciliation job re-drives it idempotently. There
 * is NO idempotency pre-check here (G3): the engine is the authority —
 *   • Cancelled → PostingService.reverseEntry (mirror legs, original → Reversed, reversedById
 *     + @@unique[sourceType=reversal,sourceId] make a double-reversal impossible);
 *   • Returned  → AccountingSync.sync (@@unique[userId,unitId,sourceType,sourceId] dedupes).
 *
 * Money (G4): a cancellation reverses the entry and only MIRRORS the cents already stored — no
 * conversion. A return books a fresh contra-revenue entry; the reais→cents conversion happens
 * exactly once, inside SalonSaleReturnedMapper.
 */

import { getFactory } from '../../../../lib/factory';
import logger from '../../../../lib/logger';
import { resolveAccountingScope } from '../../scope/AccountingScope';
import { buildSalonSaleReturnedEvent } from '../AccountingSyncPort';

/** The minimal shape this bridge reads from a DynamicTable data row (update result). */
interface SaleRow {
  id: string;
  data?: unknown;
}

/**
 * If `row` is a Cancelled or Returned sale in the BeautySalon `sales` table, apply the
 * matching accounting effect. Returns silently (no throw) for every non-applicable case and
 * swallows errors (left for reconciliation).
 *
 * @param actor   authenticated user context (owner === actor today; tenancy unchanged)
 * @param tableId the DynamicTable id the row belongs to (authoritative — from the service)
 * @param row     the updated data row (id = saleId, data = the sale fields incl. new status)
 */
export async function maybeReverseSalonSale(
  actor: { userId: string },
  tableId: string,
  row: SaleRow,
): Promise<void> {
  try {
    const data = (row.data ?? {}) as Record<string, unknown>;

    // Trigger gate (D2-Q5): only Cancelled (reverse) and Returned (contra-revenue) act here.
    const status = data.status;
    if (status !== 'Cancelled' && status !== 'Returned') return;

    // Boundary gate (identical to seam C): confirm this tableId is THIS tenant's salon `sales`
    // table, without touching the DynamicTable engine — one indexed lookup by internalName,
    // then id + category match.
    const repo = getFactory().getDynamicTableRepository();
    const salesTable = await repo.findTableByInternalName(actor.userId, 'sales');
    if (!salesTable || salesTable.id !== tableId || salesTable.category !== 'finance') return;

    // Never default/infer the unit — only post within the sale's own unit (§2 tenancy).
    const unitId = typeof data.unitId === 'string' ? data.unitId : '';
    if (!unitId) {
      logger.warn('Salon sale reversal without unitId — accounting sync skipped', {
        saleId: row.id,
      });
      return;
    }

    const scope = resolveAccountingScope(actor, unitId);
    const reason = typeof data.reason === 'string' ? data.reason : undefined;

    if (status === 'Cancelled') {
      const posting = getFactory().getPostingService();

      // Reverse the revenue recognition entry, if one was ever booked. findEntryBySource only
      // LOCATES the entry to reverse (reverseEntry needs the id); it is NOT an idempotency
      // pre-check — reverseEntry itself owns idempotency.
      const revenue = await posting.findEntryBySource(scope, 'salon.sale.finalized', row.id);
      if (revenue) {
        await posting.reverseEntry(scope, {
          unitId,
          lancamentoId: revenue.id,
          reversalPostingDate: new Date().toISOString(),
          reason,
        });
      }

      // Adaptive (D2-Q4): if a settlement entry exists, reverse it too. This branch sleeps
      // until D-settlement books 'salon.sale.settled' entries — coded now so a cancellation
      // is whole the day settlement lands.
      const settled = await posting.findEntryBySource(scope, 'salon.sale.settled', row.id);
      if (settled) {
        await posting.reverseEntry(scope, {
          unitId,
          lancamentoId: settled.id,
          reversalPostingDate: new Date().toISOString(),
          reason,
        });
      }
      return;
    }

    // status === 'Returned' — book a SEPARATE contra-revenue entry (NOT a reversal). The
    // amount must be a finite positive number; the mapper re-validates and converts to cents.
    const totalAmount = data.totalAmount;
    if (typeof totalAmount !== 'number' || !Number.isFinite(totalAmount) || totalAmount <= 0) {
      logger.warn('Salon sale Returned with invalid totalAmount — accounting sync skipped', {
        saleId: row.id,
      });
      return;
    }

    const event = buildSalonSaleReturnedEvent({
      saleId: row.id,
      unitId,
      amount: totalAmount,
      currency: typeof data.currency === 'string' ? data.currency : 'BRL',
      occurredAt:
        typeof data.returnedAt === 'string'
          ? data.returnedAt
          : typeof data.date === 'string'
            ? data.date
            : new Date().toISOString(),
      label: `Devolução ${row.id}`,
    });
    await getFactory().getAccountingSyncService().sync(scope, event);
  } catch (reversalError) {
    const code = (reversalError as { code?: string }).code;
    if (code === 'ACCOUNTING_PERIOD_NOT_OPEN') {
      logger.warn('AccountingSync skipped — período não está aberto', {
        saleId: row.id,
        error: reversalError instanceof Error ? reversalError.message : String(reversalError),
      });
      return;
    }
    logger.error('AccountingSync (salon sale reversal) failed — left for reconciliation', {
      saleId: row.id,
      status: (row.data as Record<string, unknown> | undefined)?.status,
      error: reversalError instanceof Error ? reversalError.message : String(reversalError),
    });
  }
}
