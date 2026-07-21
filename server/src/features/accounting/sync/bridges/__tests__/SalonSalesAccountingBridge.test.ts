import type { AccountingScope } from '../../../scope/AccountingScope';
import type { AccountingEvent } from '../../AccountingSyncPort';

// --- Mock the bridge's collaborators (factory + logger). resolveAccountingScope and
// buildSalonSaleFinalizedEvent are pure and left real. ---
const findTableByInternalName = jest.fn();
const findRowsByFieldValue = jest.fn();
const sync = jest.fn();
const loggerWarn = jest.fn();
const loggerError = jest.fn();

jest.mock('../../../../../lib/factory', () => ({
  __esModule: true,
  getFactory: () => ({
    getDynamicTableRepository: () => ({ findTableByInternalName, findRowsByFieldValue }),
    getAccountingSyncService: () => ({ sync }),
  }),
}));
jest.mock('../../../../../lib/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: (...a: unknown[]) => loggerWarn(...a), error: (...a: unknown[]) => loggerError(...a), debug: jest.fn() },
}));

import { maybeSyncSalonSaleFinalized } from '../SalonSalesAccountingBridge';
import { AccountingPeriodNotOpenError, MaxCentsExceededError } from '../../../../../lib/errors';
import { MAX_CENTS } from '../../../models/money';

const SALES_TABLE_ID = 'tbl-sales-1';
const actor = { userId: 'u1' };

/** A salon `sales` table owned by the actor. */
function salesTable(over: Record<string, unknown> = {}) {
  return { id: SALES_TABLE_ID, internalName: 'sales', category: 'finance', ...over };
}

/** A finalized sale row. */
function finalizedRow(over: Record<string, unknown> = {}) {
  return {
    id: 'sale-1',
    data: { status: 'Finalized', unitId: 'unit-1', totalAmount: 250, date: '2026-06-25T00:00:00.000Z', ...over },
  };
}

describe('SalonSalesAccountingBridge.maybeSyncSalonSaleFinalized', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    findTableByInternalName.mockResolvedValue(salesTable());
    // Default: no items → not all-Package → anti-revenue gate passes (revenue books as before).
    findRowsByFieldValue.mockResolvedValue([]);
    sync.mockResolvedValue({ entryId: 'entry-1' });
  });

  it('syncs ONLY a Finalized sale, with the correct event and scope (sale unit, not crossed)', async () => {
    await maybeSyncSalonSaleFinalized(actor, SALES_TABLE_ID, finalizedRow());

    expect(sync).toHaveBeenCalledTimes(1);
    const [scope, event] = sync.mock.calls[0] as [AccountingScope, AccountingEvent];
    expect(scope).toMatchObject({ ownerUserId: 'u1', actorUserId: 'u1', unitId: 'unit-1' });
    expect(event).toMatchObject({
      sourceType: 'salon.sale.finalized',
      sourceId: 'sale-1',
      unitId: 'unit-1',
      amount: 250,
      occurredAt: '2026-06-25T00:00:00.000Z',
    });
  });

  it.each(['Draft', 'Cancelled', 'Returned', 'Open'])(
    'does NOT sync a sale in status %s',
    async (status) => {
      await maybeSyncSalonSaleFinalized(actor, SALES_TABLE_ID, finalizedRow({ status }));
      expect(sync).not.toHaveBeenCalled();
    },
  );

  it('does not even look up the table for a non-Finalized sale (status gate is first)', async () => {
    await maybeSyncSalonSaleFinalized(actor, SALES_TABLE_ID, finalizedRow({ status: 'Draft' }));
    expect(findTableByInternalName).not.toHaveBeenCalled();
  });

  it('ignores a table that is not the tenant sales table (id mismatch)', async () => {
    await maybeSyncSalonSaleFinalized(actor, 'some-other-table', finalizedRow());
    expect(sync).not.toHaveBeenCalled();
  });

  it('ignores when the tenant has no sales table', async () => {
    findTableByInternalName.mockResolvedValueOnce(null);
    await maybeSyncSalonSaleFinalized(actor, SALES_TABLE_ID, finalizedRow());
    expect(sync).not.toHaveBeenCalled();
  });

  it('ignores a same-named table outside the finance category', async () => {
    findTableByInternalName.mockResolvedValueOnce(salesTable({ category: 'crm' }));
    await maybeSyncSalonSaleFinalized(actor, SALES_TABLE_ID, finalizedRow());
    expect(sync).not.toHaveBeenCalled();
  });

  it('skips (no sync) and warns when a Finalized sale has no unitId', async () => {
    await maybeSyncSalonSaleFinalized(actor, SALES_TABLE_ID, finalizedRow({ unitId: undefined }));
    expect(sync).not.toHaveBeenCalled();
    expect(loggerWarn).toHaveBeenCalled();
  });

  it.each([0, -10, NaN, Infinity, 'x'])(
    'skips (no sync) when totalAmount is invalid (%s)',
    async (totalAmount) => {
      await maybeSyncSalonSaleFinalized(actor, SALES_TABLE_ID, finalizedRow({ totalAmount }));
      expect(sync).not.toHaveBeenCalled();
    },
  );

  it('is NON-FATAL: a sync failure does not throw and is logged for reconciliation', async () => {
    sync.mockRejectedValueOnce(new Error('posting down'));
    await expect(
      maybeSyncSalonSaleFinalized(actor, SALES_TABLE_ID, finalizedRow()),
    ).resolves.toBeUndefined();
    expect(loggerError).toHaveBeenCalled();
  });

  // --- Specific-code skip-list (Council 1.5). These two tests FAIL against the previous code:
  // the old catch read `(err as {code?}).code`, but AppError carries `errorCode` — the skip
  // branch was dead and every skip-listed error fell through to logger.error. ---
  describe('skip-list by specific error code (skip+warn, NEVER logged as failure)', () => {
    it('skips ACCOUNTING_PERIOD_NOT_OPEN (period-closed is not a reconciliation failure)', async () => {
      sync.mockRejectedValueOnce(new AccountingPeriodNotOpenError(2026, 6));
      await expect(
        maybeSyncSalonSaleFinalized(actor, SALES_TABLE_ID, finalizedRow()),
      ).resolves.toBeUndefined();
      expect(loggerWarn).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ code: 'ACCOUNTING_PERIOD_NOT_OPEN' }),
      );
      expect(loggerError).not.toHaveBeenCalled();
    });

    it('skips MAX_CENTS_EXCEEDED (poison event — retrying can never succeed)', async () => {
      sync.mockRejectedValueOnce(new MaxCentsExceededError('1.1.2', MAX_CENTS + 1, MAX_CENTS));
      await expect(
        maybeSyncSalonSaleFinalized(actor, SALES_TABLE_ID, finalizedRow()),
      ).resolves.toBeUndefined();
      expect(loggerWarn).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ code: 'MAX_CENTS_EXCEEDED' }),
      );
      expect(loggerError).not.toHaveBeenCalled();
    });

    it('does NOT skip an arbitrary AppError-free failure (stays a loud error for reconciliation)', async () => {
      sync.mockRejectedValueOnce(new Error('SQLITE_BUSY forever'));
      await maybeSyncSalonSaleFinalized(actor, SALES_TABLE_ID, finalizedRow());
      expect(loggerError).toHaveBeenCalled();
    });
  });

  // --- Anti-revenue gate (Incremento G P4) ---
  describe('anti-revenue gate for all-Package sales', () => {
    it('does NOT recognize revenue for an all-Package Finalized sale (no salon.sale.finalized)', async () => {
      findRowsByFieldValue.mockResolvedValue([
        { data: { type: 'Package', packageId: 'pkg-1', saleId: 'sale-1' } },
      ]);
      await maybeSyncSalonSaleFinalized(actor, SALES_TABLE_ID, finalizedRow());
      expect(sync).not.toHaveBeenCalled();
    });

    it('STILL recognizes revenue for a Product sale (salon.sale.finalized books normally)', async () => {
      findRowsByFieldValue.mockResolvedValue([
        { data: { type: 'Product', productId: 'p-1', saleId: 'sale-1' } },
      ]);
      await maybeSyncSalonSaleFinalized(actor, SALES_TABLE_ID, finalizedRow());
      expect(sync).toHaveBeenCalledTimes(1);
      expect((sync.mock.calls[0][1] as AccountingEvent).sourceType).toBe('salon.sale.finalized');
    });

    it('STILL recognizes revenue for a Service sale', async () => {
      findRowsByFieldValue.mockResolvedValue([
        { data: { type: 'Service', serviceId: 's-1', saleId: 'sale-1' } },
      ]);
      await maybeSyncSalonSaleFinalized(actor, SALES_TABLE_ID, finalizedRow());
      expect(sync).toHaveBeenCalledTimes(1);
    });
  });

  // --- Revenue split (ADR-INCR-REVENUE-SPLIT): the bridge carries per-nature subtotals from
  // saleItems into the event so the mapper can split the credit. ---
  describe('revenue split by nature', () => {
    it('passes per-nature subtotals (Σ quantity×unitPrice) from saleItems into the event', async () => {
      findRowsByFieldValue.mockResolvedValue([
        { data: { serviceId: 's-1', quantity: 1, unitPrice: 100, saleId: 'sale-1' } },
        { data: { productId: 'p-1', quantity: 2, unitPrice: 50, saleId: 'sale-1' } },
      ]);
      await maybeSyncSalonSaleFinalized(actor, SALES_TABLE_ID, finalizedRow());
      const event = sync.mock.calls[0][1] as AccountingEvent;
      expect(event.revenueByNature).toEqual({ serviceReais: 100, productReais: 100 });
    });
  });
});
