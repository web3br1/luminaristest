import type { AccountingScope } from '../../../scope/AccountingScope';
import type { AccountingEvent } from '../../AccountingSyncPort';

// --- Mock the bridge's collaborators (factory + logger). resolveAccountingScope and
// buildSalonSaleSettledEvent are pure and left real. ---
const findTableByInternalName = jest.fn();
const sync = jest.fn();
const findEntryBySource = jest.fn();
const loggerWarn = jest.fn();
const loggerError = jest.fn();

jest.mock('../../../../../lib/factory', () => ({
  __esModule: true,
  getFactory: () => ({
    getDynamicTableRepository: () => ({ findTableByInternalName }),
    getAccountingSyncService: () => ({ sync }),
    getPostingService: () => ({ findEntryBySource }),
  }),
}));
jest.mock('../../../../../lib/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: (...a: unknown[]) => loggerWarn(...a), error: (...a: unknown[]) => loggerError(...a), debug: jest.fn() },
}));

import { maybeSyncSalonSaleSettled } from '../SalonSaleSettlementBridge';

const SALES_TABLE_ID = 'tbl-sales-1';
const actor = { userId: 'u1' };

function salesTable(over: Record<string, unknown> = {}) {
  return { id: SALES_TABLE_ID, internalName: 'sales', category: 'finance', ...over };
}

/** A Finalized + Paid sale row. */
function settledRow(over: Record<string, unknown> = {}) {
  return {
    id: 'sale-1',
    data: {
      status: 'Finalized',
      paymentStatus: 'Paid',
      paymentMethod: 'Pix',
      unitId: 'unit-1',
      totalAmount: 250,
      paidAt: '2026-06-26T00:00:00.000Z',
      date: '2026-06-25T00:00:00.000Z',
      ...over,
    },
  };
}

describe('SalonSaleSettlementBridge.maybeSyncSalonSaleSettled', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    findTableByInternalName.mockResolvedValue(salesTable());
    findEntryBySource.mockResolvedValue({ id: 'rev-1' }); // revenue exists by default
    sync.mockResolvedValue({ entryId: 'settle-1' });
  });

  it('settles ONLY a Finalized+Paid sale, with paymentMethod + paidAt carried on the event', async () => {
    await maybeSyncSalonSaleSettled(actor, SALES_TABLE_ID, settledRow());

    expect(findEntryBySource).toHaveBeenCalledWith(
      expect.objectContaining({ ownerUserId: 'u1', unitId: 'unit-1' }),
      'salon.sale.finalized',
      'sale-1',
    );
    expect(sync).toHaveBeenCalledTimes(1);
    const [scope, event] = sync.mock.calls[0] as [AccountingScope, AccountingEvent];
    expect(scope).toMatchObject({ ownerUserId: 'u1', actorUserId: 'u1', unitId: 'unit-1' });
    expect(event).toMatchObject({
      sourceType: 'salon.sale.settled',
      sourceId: 'sale-1',
      unitId: 'unit-1',
      amount: 250,
      paymentMethod: 'Pix',
      occurredAt: '2026-06-26T00:00:00.000Z', // paidAt, not date
    });
  });

  it.each([
    ['Finalized', 'Pending'],
    ['Draft', 'Paid'],
    ['Cancelled', 'Paid'],
    ['Returned', 'Paid'],
  ])('does NOT settle status=%s paymentStatus=%s', async (status, paymentStatus) => {
    await maybeSyncSalonSaleSettled(actor, SALES_TABLE_ID, settledRow({ status, paymentStatus }));
    expect(sync).not.toHaveBeenCalled();
  });

  it('does not even look up the table when the trigger gate fails (gate is first)', async () => {
    await maybeSyncSalonSaleSettled(actor, SALES_TABLE_ID, settledRow({ paymentStatus: 'Pending' }));
    expect(findTableByInternalName).not.toHaveBeenCalled();
  });

  it('ORDERING GATE: does NOT settle when the revenue entry is missing (blocked_missing_revenue_entry)', async () => {
    findEntryBySource.mockResolvedValueOnce(null);
    await maybeSyncSalonSaleSettled(actor, SALES_TABLE_ID, settledRow());
    expect(sync).not.toHaveBeenCalled();
    expect(loggerWarn).toHaveBeenCalledWith(
      expect.stringContaining('blocked_missing_revenue_entry'),
      expect.objectContaining({ saleId: 'sale-1' }),
    );
  });

  it('ignores a table that is not the tenant sales table (id mismatch)', async () => {
    await maybeSyncSalonSaleSettled(actor, 'some-other-table', settledRow());
    expect(sync).not.toHaveBeenCalled();
  });

  it('ignores a same-named table outside the finance category', async () => {
    findTableByInternalName.mockResolvedValueOnce(salesTable({ category: 'crm' }));
    await maybeSyncSalonSaleSettled(actor, SALES_TABLE_ID, settledRow());
    expect(sync).not.toHaveBeenCalled();
  });

  it('skips (no sync) and warns when a Paid sale has no unitId', async () => {
    await maybeSyncSalonSaleSettled(actor, SALES_TABLE_ID, settledRow({ unitId: undefined }));
    expect(sync).not.toHaveBeenCalled();
    expect(loggerWarn).toHaveBeenCalled();
  });

  it('skips (no sync) and warns when a Paid sale has no paymentMethod', async () => {
    await maybeSyncSalonSaleSettled(actor, SALES_TABLE_ID, settledRow({ paymentMethod: undefined }));
    expect(sync).not.toHaveBeenCalled();
    expect(loggerWarn).toHaveBeenCalled();
  });

  it.each([0, -10, NaN, Infinity, 'x'])(
    'skips (no sync) when totalAmount is invalid (%s)',
    async (totalAmount) => {
      await maybeSyncSalonSaleSettled(actor, SALES_TABLE_ID, settledRow({ totalAmount }));
      expect(sync).not.toHaveBeenCalled();
    },
  );

  it('is NON-FATAL: a sync failure does not throw and is logged for reconciliation', async () => {
    sync.mockRejectedValueOnce(new Error('posting down'));
    await expect(
      maybeSyncSalonSaleSettled(actor, SALES_TABLE_ID, settledRow()),
    ).resolves.toBeUndefined();
    expect(loggerError).toHaveBeenCalled();
  });
});
