import { AccountingSyncScheduler } from '../AccountingSyncScheduler';
import type { ReconcileSummary } from '../accountingSyncReconcile.job';

// Default reconcile is never used (every test injects its own), but the import must resolve.
jest.mock('../accountingSyncReconcile.job', () => ({
  __esModule: true,
  runAccountingSyncReconcile: jest.fn(),
}));

function summary(over: Partial<ReconcileSummary> = {}): ReconcileSummary {
  return { total: 1, synced: 1, idempotentHits: 0, failed: 0, ...over };
}

function build(reconcile?: jest.Mock) {
  const log = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
  const r = reconcile ?? jest.fn(async () => summary());
  let clock = 0;
  const scheduler = new AccountingSyncScheduler({
    reconcile: r as () => Promise<ReconcileSummary>,
    log,
    genRunId: () => 'run-fixed',
    now: () => (clock += 1000),
  });
  return { scheduler, reconcile: r, log };
}

describe('AccountingSyncScheduler', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('runOnce (lock + observability)', () => {
    it('runs reconcile and logs start + complete with the full summary', async () => {
      const { scheduler, reconcile, log } = build(
        jest.fn(async () => summary({ total: 3, synced: 2, idempotentHits: 1, failed: 0 })),
      );
      const res = await scheduler.runOnce();

      expect(reconcile).toHaveBeenCalledTimes(1);
      expect(res).toEqual({ total: 3, synced: 2, idempotentHits: 1, failed: 0 });
      expect(log.info.mock.calls.map((c) => c[1]?.event)).toContain('start');
      const complete = log.info.mock.calls.find((c) => c[1]?.event === 'complete')?.[1];
      expect(complete).toMatchObject({
        job: 'accounting_sync_reconcile',
        runId: 'run-fixed',
        event: 'complete',
        total: 3,
        synced: 2,
        idempotentHits: 1,
        failed: 0,
      });
      expect(complete).toHaveProperty('durationMs');
      expect(complete).toHaveProperty('startedAt');
    });

    it('skips an overlapping run (process-local lock) and logs skipped_due_to_lock', async () => {
      let release!: () => void;
      const gate = new Promise<void>((r) => {
        release = r;
      });
      const reconcile = jest.fn(async () => {
        await gate;
        return summary();
      });
      const { scheduler, log } = build(reconcile);

      const first = scheduler.runOnce(); // acquires the lock, blocks on gate
      const second = await scheduler.runOnce(); // lock held → skipped

      expect(second).toEqual({ skipped: 'lock' });
      expect(reconcile).toHaveBeenCalledTimes(1);
      expect(log.warn).toHaveBeenCalledWith(
        'accounting_sync_reconcile',
        expect.objectContaining({ event: 'skipped', reason: 'skipped_due_to_lock' }),
      );
      release();
      await first;
    });

    it('releases the lock after success', async () => {
      const { scheduler, reconcile } = build();
      await scheduler.runOnce();
      await scheduler.runOnce();
      expect(reconcile).toHaveBeenCalledTimes(2);
    });

    it('releases the lock after an exception and logs failed', async () => {
      const reconcile = jest
        .fn()
        .mockRejectedValueOnce(new Error('boom'))
        .mockResolvedValueOnce(summary());
      const { scheduler, log } = build(reconcile as jest.Mock);

      await expect(scheduler.runOnce()).rejects.toThrow('boom');
      expect(log.error).toHaveBeenCalledWith(
        'accounting_sync_reconcile',
        expect.objectContaining({ event: 'failed', errorName: 'Error', errorMessage: 'boom' }),
      );
      // lock released → the next run proceeds
      await expect(scheduler.runOnce()).resolves.toMatchObject({ failed: 0 });
      expect(reconcile).toHaveBeenCalledTimes(2);
    });
  });

  describe('start/stop (scheduling)', () => {
    beforeEach(() => jest.useFakeTimers());
    afterEach(() => {
      jest.clearAllTimers();
      jest.useRealTimers();
    });

    it('does NOT start timers under NODE_ENV=test without allowInTest', async () => {
      const { scheduler, reconcile } = build();
      scheduler.start(); // NODE_ENV=test, no allowInTest → no-op
      await jest.advanceTimersByTimeAsync(10 * 60 * 1000);
      expect(reconcile).not.toHaveBeenCalled();
      scheduler.stop();
    });

    it('runs on the configured interval after the initial delay (allowInTest)', async () => {
      const { scheduler, reconcile } = build();
      scheduler.start({ allowInTest: true, initialDelayMs: 1000, intervalMs: 5000 });

      expect(reconcile).not.toHaveBeenCalled();
      await jest.advanceTimersByTimeAsync(1000); // initial delay elapses
      expect(reconcile).toHaveBeenCalledTimes(1);
      await jest.advanceTimersByTimeAsync(5000); // first interval
      expect(reconcile).toHaveBeenCalledTimes(2);
      await jest.advanceTimersByTimeAsync(5000); // second interval
      expect(reconcile).toHaveBeenCalledTimes(3);
      scheduler.stop();
    });

    it('stop() clears the timers — no further runs', async () => {
      const { scheduler, reconcile } = build();
      scheduler.start({ allowInTest: true, initialDelayMs: 0, intervalMs: 1000 });
      await jest.advanceTimersByTimeAsync(0);
      const afterInitial = reconcile.mock.calls.length;

      scheduler.stop();
      await jest.advanceTimersByTimeAsync(10_000);
      expect(reconcile.mock.calls.length).toBe(afterInitial);
    });

    it('throws on invalid explicit config (interval <= 0)', () => {
      const { scheduler } = build();
      expect(() => scheduler.start({ allowInTest: true, intervalMs: -1 })).toThrow();
    });

    it('throws on invalid env config', () => {
      const prev = process.env.ACCOUNTING_SYNC_RECONCILE_INTERVAL_MS;
      process.env.ACCOUNTING_SYNC_RECONCILE_INTERVAL_MS = 'abc';
      const { scheduler } = build();
      try {
        expect(() => scheduler.start({ allowInTest: true })).toThrow();
      } finally {
        if (prev === undefined) delete process.env.ACCOUNTING_SYNC_RECONCILE_INTERVAL_MS;
        else process.env.ACCOUNTING_SYNC_RECONCILE_INTERVAL_MS = prev;
      }
    });

    it('a single failing run does not tear down the recurring scheduler', async () => {
      const reconcile = jest
        .fn()
        .mockRejectedValueOnce(new Error('transient'))
        .mockResolvedValue(summary());
      const { scheduler } = build(reconcile as jest.Mock);
      scheduler.start({ allowInTest: true, initialDelayMs: 0, intervalMs: 1000 });

      await jest.advanceTimersByTimeAsync(0); // initial tick → rejects (swallowed)
      await jest.advanceTimersByTimeAsync(1000); // next tick → succeeds
      expect(reconcile).toHaveBeenCalledTimes(2);
      scheduler.stop();
    });
  });
});
