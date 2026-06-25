/**
 * accountingSyncReconcileCli — thin manual-reprocess entry point for the AccountingSync
 * reconciliation job (Incremento B.1). It does NOT duplicate reconciliation logic: it
 * invokes the existing `runAccountingSyncReconcile()`, prints the structured summary,
 * and maps the result to a process exit code (0 when failed=0, non-zero otherwise).
 *
 * Run (compiled): `npm run accounting:reconcile` (→ node dist/jobs/accountingSyncReconcileCli.js).
 */
import prisma from '../lib/prisma';
import logger from '../lib/logger';
import { runAccountingSyncReconcile } from './accountingSyncReconcile.job';

const JOB = 'accounting_sync_reconcile';

/**
 * Runs one reconciliation pass and returns the intended exit code.
 * Always disconnects Prisma in `finally`. Never calls process.exit (testable).
 */
export async function runCli(): Promise<number> {
  try {
    const summary = await runAccountingSyncReconcile();
    logger.info(JOB, {
      job: JOB,
      event: 'cli_complete',
      total: summary.total,
      synced: summary.synced,
      idempotentHits: summary.idempotentHits,
      failed: summary.failed,
    });
    // Operator-facing structured line on stdout.
    process.stdout.write(`${JSON.stringify({ job: JOB, ...summary })}\n`);
    return summary.failed === 0 ? 0 : 1;
  } catch (error) {
    logger.error(JOB, {
      job: JOB,
      event: 'cli_failed',
      errorName: error instanceof Error ? error.name : 'UnknownError',
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return 1;
  } finally {
    await prisma.$disconnect().catch(() => {
      /* best-effort disconnect */
    });
  }
}

// Only self-execute when run directly (not when imported by a test).
if (require.main === module) {
  void runCli().then((code) => process.exit(code));
}
