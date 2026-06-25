const runAccountingSyncReconcile = jest.fn();
const disconnect = jest.fn(async () => {});

jest.mock('../accountingSyncReconcile.job', () => ({
  __esModule: true,
  runAccountingSyncReconcile: (...a: unknown[]) => runAccountingSyncReconcile(...a),
}));
jest.mock('../../lib/prisma', () => ({
  __esModule: true,
  default: { $disconnect: () => disconnect() },
}));
jest.mock('../../lib/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { runCli } from '../accountingSyncReconcileCli';

describe('accountingSyncReconcileCli.runCli', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });
  afterEach(() => jest.restoreAllMocks());

  it('returns exit code 0 when failed=0 and disconnects Prisma', async () => {
    runAccountingSyncReconcile.mockResolvedValueOnce({ total: 2, synced: 2, idempotentHits: 0, failed: 0 });
    const code = await runCli();
    expect(code).toBe(0);
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it('returns a non-zero exit code when failed>0', async () => {
    runAccountingSyncReconcile.mockResolvedValueOnce({ total: 3, synced: 2, idempotentHits: 0, failed: 1 });
    expect(await runCli()).toBe(1);
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it('returns a non-zero exit code and still disconnects Prisma when the job throws', async () => {
    runAccountingSyncReconcile.mockRejectedValueOnce(new Error('db down'));
    expect(await runCli()).toBe(1);
    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it('does not duplicate reconciliation logic — delegates to runAccountingSyncReconcile once', async () => {
    runAccountingSyncReconcile.mockResolvedValueOnce({ total: 0, synced: 0, idempotentHits: 0, failed: 0 });
    await runCli();
    expect(runAccountingSyncReconcile).toHaveBeenCalledTimes(1);
  });
});
