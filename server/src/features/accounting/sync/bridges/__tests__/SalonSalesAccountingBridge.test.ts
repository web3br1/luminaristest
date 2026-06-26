import type { AccountingScope } from '../../../scope/AccountingScope';
import type { AccountingEvent } from '../../AccountingSyncPort';

// --- Mock the bridge's collaborators (factory + logger). resolveAccountingScope and
// buildSalonSaleFinalizedEvent are pure and left real. ---
const findTableByInternalName = jest.fn();
const sync = jest.fn();
const loggerWarn = jest.fn();
const loggerError = jest.fn();

jest.mock('../../../../../lib/factory', () => ({
  __esModule: true,
  getFactory: () => ({
    getDynamicTableRepository: () => ({ findTableByInternalName }),
    getAccountingSyncService: () => ({ sync }),
  }),
}));
jest.mock('../../../../../lib/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: (...a: unknown[]) => loggerWarn(...a), error: (...a: unknown[]) => loggerError(...a), debug: jest.fn() },
}));

import { maybeSyncSalonSaleFinalized } from '../SalonSalesAccountingBridge';

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
});
