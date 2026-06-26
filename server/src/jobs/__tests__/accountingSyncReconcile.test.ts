import {
  reconcileAccountingSync,
  reconcileSalonSales,
  reconcileSalonCancellations,
  reconcileSalonReturns,
  reconcileSalonSettlements,
  type ReconcileDeps,
  type SalonReconcileDeps,
  type SalonCancellationReconcileDeps,
  type SalonReturnReconcileDeps,
  type SalonSettlementReconcileDeps,
  type WonOpportunity,
  type FinalizedSale,
  type CancelledSale,
  type ReturnedSale,
  type SettledSale,
} from '../accountingSyncReconcile.job';
import type { AccountingScope } from '../../features/accounting/scope/AccountingScope';
import type { AccountingEvent } from '../../features/accounting/sync/AccountingSyncPort';

// Mock heavy/IO module-level imports — the CORE function under test uses none of them
// (it operates purely over injected deps), but importing the job module loads them.
jest.mock('../../lib/prisma', () => ({ __esModule: true, default: {} }));
jest.mock('../../lib/factory', () => ({ __esModule: true, getFactory: jest.fn() }));
jest.mock('../../lib/logger', () => ({
  __esModule: true,
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

function opp(over: Partial<WonOpportunity> = {}): WonOpportunity {
  return {
    ownerUserId: 'owner-1',
    opportunityId: 'opp-1',
    unitId: 'unit-1',
    amount: 1000,
    currency: 'BRL',
    occurredAt: '2026-06-25T00:00:00.000Z',
    label: 'Deal',
    ...over,
  };
}

function buildDeps(over: Partial<ReconcileDeps> = {}): ReconcileDeps {
  return {
    listWonOpportunities: jest.fn(async () => [opp()]),
    hasExistingEntry: jest.fn(async () => false),
    sync: jest.fn(async () => ({ entryId: 'entry-1' })),
    ...over,
  };
}

describe('reconcileAccountingSync', () => {
  beforeEach(() => jest.clearAllMocks());

  it('books a Won opportunity that has no journal entry yet', async () => {
    const deps = buildDeps();
    const summary = await reconcileAccountingSync(deps);

    expect(deps.sync).toHaveBeenCalledTimes(1);
    expect(summary).toEqual({ total: 1, synced: 1, idempotentHits: 0, failed: 0 });
  });

  it('treats an already-booked opportunity as an idempotent hit (does NOT call sync)', async () => {
    const deps = buildDeps({ hasExistingEntry: jest.fn(async () => true) });
    const summary = await reconcileAccountingSync(deps);

    expect(deps.sync).not.toHaveBeenCalled();
    expect(summary).toEqual({ total: 1, synced: 0, idempotentHits: 1, failed: 0 });
  });

  it('derives owner=actor from the source record and never crosses unit/tenant', async () => {
    const sync = jest.fn((_s: AccountingScope, _e: AccountingEvent) => Promise.resolve({ entryId: 'e' }));
    const deps = buildDeps({
      listWonOpportunities: jest.fn(async () => [
        opp({ ownerUserId: 'owner-A', unitId: 'unit-A', opportunityId: 'opp-A', amount: 250 }),
      ]),
      sync,
    });

    await reconcileAccountingSync(deps);

    const [scope, event] = sync.mock.calls[0]!;
    expect(scope.ownerUserId).toBe('owner-A');
    expect(scope.actorUserId).toBe('owner-A'); // owner-as-actor in the system re-drive
    expect(scope.unitId).toBe('unit-A'); // unit of the SOURCE record, not crossed
    expect(event.sourceType).toBe('crm.opportunity.won');
    expect(event.sourceId).toBe('opp-A');
    expect(event.amount).toBe(250);
  });

  it('continues processing after an isolated failure', async () => {
    const sync = jest
      .fn()
      .mockResolvedValueOnce({ entryId: 'e1' })
      .mockRejectedValueOnce(new Error('boom')) // middle item fails
      .mockResolvedValueOnce({ entryId: 'e3' });
    const deps = buildDeps({
      listWonOpportunities: jest.fn(async () => [
        opp({ opportunityId: 'opp-1' }),
        opp({ opportunityId: 'opp-2' }),
        opp({ opportunityId: 'opp-3' }),
      ]),
      sync: sync as jest.Mock,
    });

    const summary = await reconcileAccountingSync(deps);

    expect(sync).toHaveBeenCalledTimes(3); // did not stop at the failure
    expect(summary).toEqual({ total: 3, synced: 2, idempotentHits: 0, failed: 1 });
  });

  it('fails an opportunity with no unitId without calling hasExistingEntry/sync, and continues', async () => {
    const hasExistingEntry = jest.fn(async () => false);
    const sync = jest.fn(async () => ({ entryId: 'e' }));
    const deps = buildDeps({
      listWonOpportunities: jest.fn(async () => [
        opp({ opportunityId: 'bad', unitId: '' }),
        opp({ opportunityId: 'good', unitId: 'unit-1' }),
      ]),
      hasExistingEntry,
      sync,
    });

    const summary = await reconcileAccountingSync(deps);

    expect(summary).toEqual({ total: 2, synced: 1, idempotentHits: 0, failed: 1 });
    // the bad (unitless) opp never reached the entry check or sync
    expect(hasExistingEntry).toHaveBeenCalledTimes(1);
    expect(sync).toHaveBeenCalledTimes(1);
  });
});

function sale(over: Partial<FinalizedSale> = {}): FinalizedSale {
  return {
    ownerUserId: 'owner-1',
    saleId: 'sale-1',
    unitId: 'unit-1',
    amount: 250,
    currency: 'BRL',
    occurredAt: '2026-06-25T00:00:00.000Z',
    ...over,
  };
}

function buildSalonDeps(over: Partial<SalonReconcileDeps> = {}): SalonReconcileDeps {
  return {
    listFinalizedSales: jest.fn(async () => [sale()]),
    hasExistingEntry: jest.fn(async () => false),
    sync: jest.fn(async () => ({ entryId: 'entry-1' })),
    ...over,
  };
}

describe('reconcileSalonSales', () => {
  beforeEach(() => jest.clearAllMocks());

  it('books a Finalized sale that has no journal entry yet', async () => {
    const deps = buildSalonDeps();
    const summary = await reconcileSalonSales(deps);

    expect(deps.sync).toHaveBeenCalledTimes(1);
    expect(summary).toEqual({ total: 1, synced: 1, idempotentHits: 0, failed: 0 });
  });

  it('treats an already-booked sale as an idempotent hit (does NOT call sync)', async () => {
    const deps = buildSalonDeps({ hasExistingEntry: jest.fn(async () => true) });
    const summary = await reconcileSalonSales(deps);

    expect(deps.sync).not.toHaveBeenCalled();
    expect(summary).toEqual({ total: 1, synced: 0, idempotentHits: 1, failed: 0 });
  });

  it('derives owner=actor from the source sale and never crosses unit/tenant', async () => {
    const sync = jest.fn((_s: AccountingScope, _e: AccountingEvent) => Promise.resolve({ entryId: 'e' }));
    const deps = buildSalonDeps({
      listFinalizedSales: jest.fn(async () => [
        sale({ ownerUserId: 'owner-A', unitId: 'unit-A', saleId: 'sale-A', amount: 99.99 }),
      ]),
      sync,
    });

    await reconcileSalonSales(deps);

    const [scope, event] = sync.mock.calls[0]!;
    expect(scope.ownerUserId).toBe('owner-A');
    expect(scope.actorUserId).toBe('owner-A'); // owner-as-actor in the system re-drive
    expect(scope.unitId).toBe('unit-A'); // unit of the SOURCE record, not crossed
    expect(event.sourceType).toBe('salon.sale.finalized');
    expect(event.sourceId).toBe('sale-A');
    expect(event.amount).toBe(99.99); // raw float; mapper converts to cents
  });

  it('continues processing after an isolated failure', async () => {
    const sync = jest
      .fn()
      .mockResolvedValueOnce({ entryId: 'e1' })
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ entryId: 'e3' });
    const deps = buildSalonDeps({
      listFinalizedSales: jest.fn(async () => [
        sale({ saleId: 'sale-1' }),
        sale({ saleId: 'sale-2' }),
        sale({ saleId: 'sale-3' }),
      ]),
      sync: sync as jest.Mock,
    });

    const summary = await reconcileSalonSales(deps);

    expect(sync).toHaveBeenCalledTimes(3); // did not stop at the failure
    expect(summary).toEqual({ total: 3, synced: 2, idempotentHits: 0, failed: 1 });
  });

  it('fails a sale with no unitId without calling hasExistingEntry/sync, and continues', async () => {
    const hasExistingEntry = jest.fn(async () => false);
    const sync = jest.fn(async () => ({ entryId: 'e' }));
    const deps = buildSalonDeps({
      listFinalizedSales: jest.fn(async () => [
        sale({ saleId: 'bad', unitId: '' }),
        sale({ saleId: 'good', unitId: 'unit-1' }),
      ]),
      hasExistingEntry,
      sync,
    });

    const summary = await reconcileSalonSales(deps);

    expect(summary).toEqual({ total: 2, synced: 1, idempotentHits: 0, failed: 1 });
    expect(hasExistingEntry).toHaveBeenCalledTimes(1);
    expect(sync).toHaveBeenCalledTimes(1);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Incremento D — reversal reconcile passes
// ───────────────────────────────────────────────────────────────────────────

function cancelled(over: Partial<CancelledSale> = {}): CancelledSale {
  return { ownerUserId: 'owner-1', saleId: 'sale-1', unitId: 'unit-1', ...over };
}

function buildCancelDeps(over: Partial<SalonCancellationReconcileDeps> = {}): SalonCancellationReconcileDeps {
  return {
    listCancelledSales: jest.fn(async () => [cancelled()]),
    // default: the finalized entry is still Posted (reversible); settlement absent.
    findEntry: jest.fn(async (_s: AccountingScope, type: string) =>
      type === 'salon.sale.finalized' ? { id: 'entry-1', status: 'Posted' } : null,
    ),
    reverse: jest.fn(async () => undefined),
    ...over,
  };
}

describe('reconcileSalonCancellations', () => {
  beforeEach(() => jest.clearAllMocks());

  it('re-fires reverse for a cancelled sale whose finalized entry is still Posted', async () => {
    const deps = buildCancelDeps();
    const summary = await reconcileSalonCancellations(deps);

    expect(deps.reverse).toHaveBeenCalledTimes(1);
    expect(deps.reverse).toHaveBeenCalledWith(
      expect.objectContaining({ ownerUserId: 'owner-1', unitId: 'unit-1' }),
      'unit-1',
      'entry-1',
    );
    expect(summary).toEqual({ total: 1, synced: 1, idempotentHits: 0, failed: 0 });
  });

  it('treats an already-reversed entry as an idempotent hit (does NOT reverse)', async () => {
    const deps = buildCancelDeps({
      findEntry: jest.fn(async (_s: AccountingScope, type: string) =>
        type === 'salon.sale.finalized' ? { id: 'entry-1', status: 'Reversed' } : null,
      ),
    });
    const summary = await reconcileSalonCancellations(deps);

    expect(deps.reverse).not.toHaveBeenCalled();
    expect(summary).toEqual({ total: 1, synced: 0, idempotentHits: 1, failed: 0 });
  });

  it('adaptive (D2-Q4): also reverses a Posted settlement entry', async () => {
    const deps = buildCancelDeps({
      findEntry: jest.fn(async (_s: AccountingScope, type: string) =>
        type === 'salon.sale.finalized'
          ? { id: 'entry-1', status: 'Posted' }
          : type === 'salon.sale.settled'
            ? { id: 'settle-1', status: 'Posted' }
            : null,
      ),
    });
    await reconcileSalonCancellations(deps);
    expect(deps.reverse).toHaveBeenCalledTimes(2);
  });

  it('continues after an isolated failure', async () => {
    const reverse = jest
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(undefined);
    const deps = buildCancelDeps({
      listCancelledSales: jest.fn(async () => [
        cancelled({ saleId: 's1' }),
        cancelled({ saleId: 's2' }),
        cancelled({ saleId: 's3' }),
      ]),
      reverse,
    });
    const summary = await reconcileSalonCancellations(deps);
    expect(summary).toEqual({ total: 3, synced: 2, idempotentHits: 0, failed: 1 });
  });

  it('fails a sale with no unitId without reversing, and continues', async () => {
    const deps = buildCancelDeps({
      listCancelledSales: jest.fn(async () => [cancelled({ saleId: 'bad', unitId: '' }), cancelled({ saleId: 'good' })]),
    });
    const summary = await reconcileSalonCancellations(deps);
    expect(summary).toEqual({ total: 2, synced: 1, idempotentHits: 0, failed: 1 });
  });
});

function returned(over: Partial<ReturnedSale> = {}): ReturnedSale {
  return {
    ownerUserId: 'owner-1',
    saleId: 'sale-1',
    unitId: 'unit-1',
    amount: 250,
    currency: 'BRL',
    occurredAt: '2026-06-25T00:00:00.000Z',
    ...over,
  };
}

function buildReturnDeps(over: Partial<SalonReturnReconcileDeps> = {}): SalonReturnReconcileDeps {
  return {
    listReturnedSales: jest.fn(async () => [returned()]),
    hasExistingEntry: jest.fn(async () => false),
    sync: jest.fn(async () => ({ entryId: 'ret-1' })),
    ...over,
  };
}

describe('reconcileSalonReturns', () => {
  beforeEach(() => jest.clearAllMocks());

  it('re-fires sync for a returned sale that has no contra-revenue entry yet', async () => {
    const deps = buildReturnDeps();
    const summary = await reconcileSalonReturns(deps);

    expect(deps.sync).toHaveBeenCalledTimes(1);
    const [, event] = (deps.sync as jest.Mock).mock.calls[0] as [AccountingScope, AccountingEvent];
    expect(event.sourceType).toBe('salon.sale.returned');
    expect(event.sourceId).toBe('sale-1');
    expect(summary).toEqual({ total: 1, synced: 1, idempotentHits: 0, failed: 0 });
  });

  it('treats an already-booked return as an idempotent hit (does NOT sync)', async () => {
    const deps = buildReturnDeps({ hasExistingEntry: jest.fn(async () => true) });
    const summary = await reconcileSalonReturns(deps);

    expect(deps.sync).not.toHaveBeenCalled();
    expect(summary).toEqual({ total: 1, synced: 0, idempotentHits: 1, failed: 0 });
  });

  it('continues after an isolated failure', async () => {
    const sync = jest
      .fn()
      .mockResolvedValueOnce({ entryId: 'e1' })
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ entryId: 'e3' });
    const deps = buildReturnDeps({
      listReturnedSales: jest.fn(async () => [
        returned({ saleId: 's1' }),
        returned({ saleId: 's2' }),
        returned({ saleId: 's3' }),
      ]),
      sync: sync as jest.Mock,
    });
    const summary = await reconcileSalonReturns(deps);
    expect(summary).toEqual({ total: 3, synced: 2, idempotentHits: 0, failed: 1 });
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Incremento D / D1 — settlement reconcile pass
// ───────────────────────────────────────────────────────────────────────────

function settled(over: Partial<SettledSale> = {}): SettledSale {
  return {
    ownerUserId: 'owner-1',
    saleId: 'sale-1',
    unitId: 'unit-1',
    amount: 250,
    currency: 'BRL',
    occurredAt: '2026-06-26T00:00:00.000Z',
    paymentMethod: 'Pix',
    ...over,
  };
}

type SettlementDeps = SalonSettlementReconcileDeps & {
  hasRevenueEntry: (scope: AccountingScope, sourceId: string) => Promise<boolean>;
};

function buildSettlementDeps(over: Partial<SettlementDeps> = {}): SettlementDeps {
  return {
    listSettledSales: jest.fn(async () => [settled()]),
    hasExistingEntry: jest.fn(async () => false), // no settlement entry yet
    hasRevenueEntry: jest.fn(async () => true), // revenue exists by default
    sync: jest.fn(async () => ({ entryId: 'settle-1' })),
    ...over,
  };
}

describe('reconcileSalonSettlements', () => {
  beforeEach(() => jest.clearAllMocks());

  it('re-fires sync for a Finalized+Paid sale with no settlement entry yet', async () => {
    const deps = buildSettlementDeps();
    const summary = await reconcileSalonSettlements(deps);

    expect(deps.sync).toHaveBeenCalledTimes(1);
    const [, event] = (deps.sync as jest.Mock).mock.calls[0] as [AccountingScope, AccountingEvent];
    expect(event.sourceType).toBe('salon.sale.settled');
    expect(event.sourceId).toBe('sale-1');
    expect(event.paymentMethod).toBe('Pix');
    expect(summary).toEqual({ total: 1, synced: 1, idempotentHits: 0, failed: 0, blocked: 0 });
  });

  it('treats an already-settled sale as an idempotent hit (does NOT sync)', async () => {
    const deps = buildSettlementDeps({ hasExistingEntry: jest.fn(async () => true) });
    const summary = await reconcileSalonSettlements(deps);

    expect(deps.sync).not.toHaveBeenCalled();
    expect(summary).toEqual({ total: 1, synced: 0, idempotentHits: 1, failed: 0, blocked: 0 });
  });

  it('counts a sale whose revenue entry is missing as BLOCKED (deferred), not failed — batch continues', async () => {
    const deps = buildSettlementDeps({
      listSettledSales: jest.fn(async () => [settled({ saleId: 'no-rev' }), settled({ saleId: 'ok' })]),
      // first sale lacks revenue, second has it
      hasRevenueEntry: jest
        .fn()
        .mockResolvedValueOnce(false)
        .mockResolvedValueOnce(true),
    });
    const summary = await reconcileSalonSettlements(deps);

    expect(deps.sync).toHaveBeenCalledTimes(1); // only the sale with revenue settled
    expect(summary).toEqual({ total: 2, synced: 1, idempotentHits: 0, failed: 0, blocked: 1 });
  });

  it('continues after an isolated failure', async () => {
    const sync = jest
      .fn()
      .mockResolvedValueOnce({ entryId: 'e1' })
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce({ entryId: 'e3' });
    const deps = buildSettlementDeps({
      listSettledSales: jest.fn(async () => [
        settled({ saleId: 's1' }),
        settled({ saleId: 's2' }),
        settled({ saleId: 's3' }),
      ]),
      sync: sync as jest.Mock,
    });
    const summary = await reconcileSalonSettlements(deps);
    expect(summary).toEqual({ total: 3, synced: 2, idempotentHits: 0, failed: 1, blocked: 0 });
  });

  it('fails a sale with no unitId without syncing, and continues', async () => {
    const deps = buildSettlementDeps({
      listSettledSales: jest.fn(async () => [settled({ saleId: 'bad', unitId: '' }), settled({ saleId: 'good' })]),
    });
    const summary = await reconcileSalonSettlements(deps);
    expect(summary).toEqual({ total: 2, synced: 1, idempotentHits: 0, failed: 1, blocked: 0 });
  });
});
