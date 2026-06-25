import {
  reconcileAccountingSync,
  type ReconcileDeps,
  type WonOpportunity,
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
