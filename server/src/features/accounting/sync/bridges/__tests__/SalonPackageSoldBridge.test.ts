import type { AccountingScope } from '../../../scope/AccountingScope';
import type { AccountingEvent } from '../../AccountingSyncPort';

// Mock the bridge's collaborators (factory + logger). resolveAccountingScope,
// buildSalonPackageSoldEvent and classifySaleItems are real (classify reads via the
// mocked repository).
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

import { maybeSyncSalonPackageSold } from '../SalonPackageSoldBridge';

const SALES_TABLE_ID = 'tbl-sales-1';
const actor = { userId: 'u1' };

function salesTable(over: Record<string, unknown> = {}) {
  return { id: SALES_TABLE_ID, internalName: 'sales', category: 'finance', ...over };
}
function finalizedRow(over: Record<string, unknown> = {}) {
  return {
    id: 'sale-1',
    data: { status: 'Finalized', unitId: 'unit-1', totalAmount: 500, date: '2026-06-26T00:00:00.000Z', ...over },
  };
}
const packageItems = [{ data: { type: 'Package', packageId: 'pkg-1', saleId: 'sale-1' } }];
const productItems = [{ data: { type: 'Product', productId: 'p-1', saleId: 'sale-1' } }];

describe('SalonPackageSoldBridge.maybeSyncSalonPackageSold', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    findTableByInternalName.mockResolvedValue(salesTable());
    findRowsByFieldValue.mockResolvedValue(packageItems); // all-Package by default
    sync.mockResolvedValue({ entryId: 'entry-pkg-1' });
  });

  it('syncs an all-Package Finalized sale with salon.package.sold (origin), correct scope/event', async () => {
    await maybeSyncSalonPackageSold(actor, SALES_TABLE_ID, finalizedRow());
    expect(sync).toHaveBeenCalledTimes(1);
    const [scope, event] = sync.mock.calls[0] as [AccountingScope, AccountingEvent];
    expect(scope).toMatchObject({ ownerUserId: 'u1', actorUserId: 'u1', unitId: 'unit-1' });
    expect(event).toMatchObject({
      sourceType: 'salon.package.sold',
      sourceId: 'sale-1',
      unitId: 'unit-1',
      amount: 500,
    });
  });

  it.each(['Draft', 'Cancelled', 'Returned'])('does NOT sync a sale in status %s', async (status) => {
    await maybeSyncSalonPackageSold(actor, SALES_TABLE_ID, finalizedRow({ status }));
    expect(sync).not.toHaveBeenCalled();
  });

  it('ignores a table that is not the tenant sales table (id mismatch)', async () => {
    await maybeSyncSalonPackageSold(actor, 'some-other-table', finalizedRow());
    expect(sync).not.toHaveBeenCalled();
  });

  it('ignores when the tenant has no sales table', async () => {
    findTableByInternalName.mockResolvedValueOnce(null);
    await maybeSyncSalonPackageSold(actor, SALES_TABLE_ID, finalizedRow());
    expect(sync).not.toHaveBeenCalled();
  });

  it('does NOT sync a Product/Service sale (not all-Package)', async () => {
    findRowsByFieldValue.mockResolvedValue(productItems);
    await maybeSyncSalonPackageSold(actor, SALES_TABLE_ID, finalizedRow());
    expect(sync).not.toHaveBeenCalled();
  });

  it('does NOT sync when the sale has no items (Empty)', async () => {
    findRowsByFieldValue.mockResolvedValue([]);
    await maybeSyncSalonPackageSold(actor, SALES_TABLE_ID, finalizedRow());
    expect(sync).not.toHaveBeenCalled();
  });

  it('skips (no sync) and warns when an all-Package sale has no unitId', async () => {
    await maybeSyncSalonPackageSold(actor, SALES_TABLE_ID, finalizedRow({ unitId: undefined }));
    expect(sync).not.toHaveBeenCalled();
    expect(loggerWarn).toHaveBeenCalled();
  });

  it.each([0, -10, NaN, 'x'])('skips (no sync) when totalAmount is invalid (%s)', async (totalAmount) => {
    await maybeSyncSalonPackageSold(actor, SALES_TABLE_ID, finalizedRow({ totalAmount }));
    expect(sync).not.toHaveBeenCalled();
  });

  it('is NON-FATAL: a sync failure does not throw and is logged for reconciliation', async () => {
    sync.mockRejectedValueOnce(new Error('posting down'));
    await expect(
      maybeSyncSalonPackageSold(actor, SALES_TABLE_ID, finalizedRow()),
    ).resolves.toBeUndefined();
    expect(loggerError).toHaveBeenCalled();
  });
});
