/**
 * SalonPackageSoldBridge — Incremento G P4 origin seam.
 *
 * Turns a finalized ALL-PACKAGE salon sale into the prepaid-package origin journal entry
 * (D 1.1.2 A Receber / C 2.1.1 Pacotes Pré-pagos) via AccountingSync. It is the package
 * counterpart of maybeSyncSalonSaleFinalized and follows the same rules: it lives in the
 * accounting (Prisma first-class) world, is invoked POST-COMMIT from the DynamicTable
 * controller, NEVER inside DynamicTableService/RuleContext/RulePlugin (§2.1), is best-effort
 * and non-fatal (reconcile re-drives), and delegates idempotency entirely to PostingService
 * (@@unique[userId,unitId,sourceType,sourceId]) — no pre-check here.
 *
 * It also CREDITS the customer's prepaid balance (PackageBalanceService.creditFromSale,
 * Incremento G P5) — this is origin, not consumption (the debit stays in RegisterPayment).
 * The credit is idempotent per (saleId,'credit'); MVP requires exactly ONE distinct
 * packageId per package sale (enforced at saleItems validation), so the whole totalAmount
 * credits that single balance.
 */

import { getFactory } from '../../../../lib/factory';
import logger from '../../../../lib/logger';
import { resolveAccountingScope } from '../../scope/AccountingScope';
import { buildSalonPackageSoldEvent } from '../AccountingSyncPort';
import { loadSalePackageInfo } from './salonSaleItems';

/** The minimal shape this bridge reads from a DynamicTable data row (create/update result). */
interface SaleRow {
  id: string;
  data?: unknown;
}

/**
 * If `row` is a finalized all-Package sale in the BeautySalon `sales` table, book its
 * prepaid-package origin. Returns silently for every non-applicable case and swallows
 * sync errors (non-fatal; reconcile re-drives idempotently).
 */
export async function maybeSyncSalonPackageSold(
  actor: { userId: string },
  tableId: string,
  row: SaleRow,
): Promise<void> {
  try {
    const data = (row.data ?? {}) as Record<string, unknown>;

    // Trigger gate: origin is recognized on Finalized (mirrors revenue recognition timing).
    if (data.status !== 'Finalized') return;

    // Boundary gate: confirm tableId is THIS tenant's salon `sales` table (no engine access).
    const repo = getFactory().getDynamicTableRepository();
    const salesTable = await repo.findTableByInternalName(actor.userId, 'sales');
    if (!salesTable || salesTable.id !== tableId || salesTable.category !== 'finance') return;

    // Routing gate (proven from saleItems, not the header): origin applies ONLY to an
    // all-Package sale. Product/Service sales are handled by the revenue bridge.
    const itemsInfo = await loadSalePackageInfo(actor.userId, row.id);
    if (itemsInfo.kind !== 'Package') return;

    // Never default/infer the unit — only post within the sale's own unit (§2 tenancy).
    const unitId = typeof data.unitId === 'string' ? data.unitId : '';
    if (!unitId) {
      logger.warn('Package sale Finalized without unitId — accounting sync skipped', {
        saleId: row.id,
      });
      return;
    }

    // totalAmount must be a finite positive number; the mapper re-validates and converts.
    const totalAmount = data.totalAmount;
    if (typeof totalAmount !== 'number' || !Number.isFinite(totalAmount) || totalAmount <= 0) {
      logger.warn('Package sale Finalized with invalid totalAmount — accounting sync skipped', {
        saleId: row.id,
      });
      return;
    }

    const event = buildSalonPackageSoldEvent({
      saleId: row.id,
      unitId,
      amount: totalAmount,
      currency: typeof data.currency === 'string' ? data.currency : 'BRL',
      occurredAt: typeof data.date === 'string' ? data.date : new Date().toISOString(),
      label: `Pacote pré-pago — Venda ${row.id}`,
    });
    const scope = resolveAccountingScope(actor, unitId);
    await getFactory().getAccountingSyncService().sync(scope, event);

    // Balance origin (P5): credit the customer's prepaid balance for the single package.
    // MVP requires exactly one distinct packageId (enforced at saleItems validation); guard
    // defensively here too. creditFromSale is idempotent per (saleId,'credit').
    const customerId = typeof data.customerId === 'string' ? data.customerId : '';
    if (itemsInfo.packageIds.length === 1 && customerId) {
      await getFactory()
        .getPackageBalanceService()
        .creditFromSale(scope, {
          customerId,
          packageId: itemsInfo.packageIds[0],
          saleId: row.id,
          amountCents: Math.round(totalAmount * 100),
        });
    } else {
      logger.warn('Package sale balance credit skipped — need exactly one packageId and a customerId', {
        saleId: row.id,
        distinctPackageIds: itemsInfo.packageIds.length,
        hasCustomer: !!customerId,
      });
    }
  } catch (syncError) {
    const code = (syncError as { code?: string }).code;
    if (code === 'ACCOUNTING_PERIOD_NOT_OPEN') {
      logger.warn('AccountingSync skipped — período não está aberto', {
        saleId: row.id,
        error: syncError instanceof Error ? syncError.message : String(syncError),
      });
      return;
    }
    logger.error('AccountingSync (salon package sold) failed — left for reconciliation', {
      saleId: row.id,
      error: syncError instanceof Error ? syncError.message : String(syncError),
    });
  }
}
