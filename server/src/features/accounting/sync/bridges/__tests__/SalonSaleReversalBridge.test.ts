import type { AccountingScope } from '../../../scope/AccountingScope';
import type { AccountingEvent } from '../../AccountingSyncPort';

// --- Mock the bridge's collaborators (factory + logger). resolveAccountingScope and
// buildSalonSaleReturnedEvent are pure and left real. ---
const findTableByInternalName = jest.fn();
const findEntryBySource = jest.fn();
const reverseEntry = jest.fn();
const sync = jest.fn();
const loggerWarn = jest.fn();
const loggerError = jest.fn();

jest.mock('../../../../../lib/factory', () => ({
  __esModule: true,
  getFactory: () => ({
    getDynamicTableRepository: () => ({ findTableByInternalName }),
    getPostingService: () => ({ findEntryBySource, reverseEntry }),
    getAccountingSyncService: () => ({ sync }),
  }),
}));
jest.mock('../../../../../lib/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    warn: (...a: unknown[]) => loggerWarn(...a),
    error: (...a: unknown[]) => loggerError(...a),
    debug: jest.fn(),
  },
}));

import { maybeReverseSalonSale } from '../SalonSaleReversalBridge';

const SALES_TABLE_ID = 'tbl-sales-1';
const actor = { userId: 'u1' };

function salesTable(over: Record<string, unknown> = {}) {
  return { id: SALES_TABLE_ID, internalName: 'sales', category: 'finance', ...over };
}

function cancelledRow(over: Record<string, unknown> = {}) {
  return {
    id: 'sale-1',
    data: { status: 'Cancelled', unitId: 'unit-1', totalAmount: 250, reason: 'customer gave up', ...over },
  };
}
function returnedRow(over: Record<string, unknown> = {}) {
  return {
    id: 'sale-1',
    data: { status: 'Returned', unitId: 'unit-1', totalAmount: 250, date: '2026-06-25T00:00:00.000Z', ...over },
  };
}

describe('SalonSaleReversalBridge.maybeReverseSalonSale', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    findTableByInternalName.mockResolvedValue(salesTable());
    findEntryBySource.mockResolvedValue(null);
    reverseEntry.mockResolvedValue({ reversal: { id: 'rev-1' }, original: { id: 'entry-1' } });
    sync.mockResolvedValue({ entryId: 'ret-1' });
  });

  describe('status gate (no action outside Cancelled/Returned)', () => {
    it.each(['Draft', 'Finalized', 'Open'])('does nothing for status %s', async (status) => {
      await maybeReverseSalonSale(actor, SALES_TABLE_ID, cancelledRow({ status }));
      expect(reverseEntry).not.toHaveBeenCalled();
      expect(sync).not.toHaveBeenCalled();
    });

    it('does not even look up the table for a non-transition status (gate is first)', async () => {
      await maybeReverseSalonSale(actor, SALES_TABLE_ID, cancelledRow({ status: 'Finalized' }));
      expect(findTableByInternalName).not.toHaveBeenCalled();
    });
  });

  describe('Cancelled → reverse', () => {
    it('reverses the finalized revenue entry, passing the reason', async () => {
      findEntryBySource.mockImplementation(async (_s: AccountingScope, type: string) =>
        type === 'salon.sale.finalized' ? { id: 'entry-1' } : null,
      );
      await maybeReverseSalonSale(actor, SALES_TABLE_ID, cancelledRow());

      expect(findEntryBySource).toHaveBeenCalledWith(expect.any(Object), 'salon.sale.finalized', 'sale-1');
      expect(reverseEntry).toHaveBeenCalledTimes(1);
      const [scope, input] = reverseEntry.mock.calls[0];
      expect(scope).toMatchObject({ ownerUserId: 'u1', unitId: 'unit-1' });
      expect(input).toMatchObject({ unitId: 'unit-1', lancamentoId: 'entry-1', reason: 'customer gave up' });
      expect(typeof input.reversalPostingDate).toBe('string');
      expect(sync).not.toHaveBeenCalled(); // a cancel is a reversal, never a new entry
    });

    it('adaptive (D2-Q4): also reverses the settlement entry when one exists', async () => {
      findEntryBySource.mockImplementation(async (_s: AccountingScope, type: string) =>
        type === 'salon.sale.finalized' ? { id: 'entry-1' } : type === 'salon.sale.settled' ? { id: 'settle-1' } : null,
      );
      await maybeReverseSalonSale(actor, SALES_TABLE_ID, cancelledRow());

      expect(reverseEntry).toHaveBeenCalledTimes(2);
      expect(reverseEntry.mock.calls.map((c) => c[1].lancamentoId)).toEqual(['entry-1', 'settle-1']);
    });

    it('no finalized entry yet → no reverse, no throw (left for reconciliation)', async () => {
      findEntryBySource.mockResolvedValue(null);
      await maybeReverseSalonSale(actor, SALES_TABLE_ID, cancelledRow());
      expect(reverseEntry).not.toHaveBeenCalled();
    });

    // Idempotency is OWNED by PostingService.reverseEntry (reversedById / findBySource). With a
    // stateful mock that mimics it, two cancellations of the same sale yield ONE new reversal.
    it('cancelling twice yields a single reversal (engine idempotency, no bridge pre-check)', async () => {
      let reversed = false;
      findEntryBySource.mockImplementation(async (_s: AccountingScope, type: string) =>
        type === 'salon.sale.finalized' ? { id: 'entry-1' } : null,
      );
      reverseEntry.mockImplementation(async () => {
        const isNew = !reversed;
        reversed = true;
        return { reversal: { id: 'rev-1', isNew }, original: { id: 'entry-1' } };
      });

      const first = await collectReversal(() => maybeReverseSalonSale(actor, SALES_TABLE_ID, cancelledRow()));
      const second = await collectReversal(() => maybeReverseSalonSale(actor, SALES_TABLE_ID, cancelledRow()));

      expect(first).toEqual([true]); // first call created the reversal
      expect(second).toEqual([false]); // second call deduped to the existing one
    });
  });

  describe('Returned → contra-revenue entry', () => {
    it('books a NEW salon.sale.returned entry (NOT a reversal) with the sale amount', async () => {
      await maybeReverseSalonSale(actor, SALES_TABLE_ID, returnedRow());

      expect(reverseEntry).not.toHaveBeenCalled();
      expect(sync).toHaveBeenCalledTimes(1);
      const [scope, event] = sync.mock.calls[0] as [AccountingScope, AccountingEvent];
      expect(scope).toMatchObject({ ownerUserId: 'u1', unitId: 'unit-1' });
      expect(event).toMatchObject({
        sourceType: 'salon.sale.returned',
        sourceId: 'sale-1',
        unitId: 'unit-1',
        amount: 250,
      });
    });

    it.each([0, -10, NaN, Infinity, 'x'])('skips a Returned sale with invalid totalAmount (%s)', async (totalAmount) => {
      await maybeReverseSalonSale(actor, SALES_TABLE_ID, returnedRow({ totalAmount }));
      expect(sync).not.toHaveBeenCalled();
    });
  });

  describe('boundary + tenancy gates (identical to seam C)', () => {
    it('ignores a tableId that is not the tenant sales table (id mismatch)', async () => {
      await maybeReverseSalonSale(actor, 'other-table', cancelledRow());
      expect(reverseEntry).not.toHaveBeenCalled();
    });
    it('ignores when the tenant has no sales table', async () => {
      findTableByInternalName.mockResolvedValueOnce(null);
      await maybeReverseSalonSale(actor, SALES_TABLE_ID, cancelledRow());
      expect(reverseEntry).not.toHaveBeenCalled();
    });
    it('ignores a same-named table outside the finance category', async () => {
      findTableByInternalName.mockResolvedValueOnce(salesTable({ category: 'crm' }));
      await maybeReverseSalonSale(actor, SALES_TABLE_ID, cancelledRow());
      expect(reverseEntry).not.toHaveBeenCalled();
    });
    it('skips and warns when the row has no unitId', async () => {
      await maybeReverseSalonSale(actor, SALES_TABLE_ID, cancelledRow({ unitId: undefined }));
      expect(reverseEntry).not.toHaveBeenCalled();
      expect(loggerWarn).toHaveBeenCalled();
    });
  });

  it('is NON-FATAL: a reversal failure does not throw and is logged for reconciliation', async () => {
    findEntryBySource.mockResolvedValue({ id: 'entry-1' });
    reverseEntry.mockRejectedValueOnce(new Error('posting down'));
    await expect(maybeReverseSalonSale(actor, SALES_TABLE_ID, cancelledRow())).resolves.toBeUndefined();
    expect(loggerError).toHaveBeenCalled();
  });
});

/** Helper: run the bridge and return the `isNew` flags from each reverseEntry call. */
async function collectReversal(run: () => Promise<void>): Promise<boolean[]> {
  const before = reverseEntry.mock.results.length;
  await run();
  const after = reverseEntry.mock.results.slice(before);
  return Promise.all(after.map((r) => r.value)).then((vals) =>
    vals.map((v) => (v as { reversal: { isNew: boolean } }).reversal.isNew),
  );
}
