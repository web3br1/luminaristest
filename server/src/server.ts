import app from './app';
import { runQdrantInitialization } from './lib/vector/qdrant';
import prisma from './lib/prisma';
import { logger } from './lib/logger';
import { purgeOldDeletedRecords } from './jobs/PurgeDeletedRecords';
import { accountingSyncScheduler } from './jobs/AccountingSyncScheduler';
import { DocumentStatus } from './features/documents/models/Document.model';

const PORT = process.env.PORT || 3001;

// Start server
const httpServer = app.listen(PORT, () => {
  console.log(`Luminaris Server running on http://localhost:${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);

  // Initialize external infra at bootstrap (not on module import). Fire-and-forget: the function
  // logs and swallows its own errors, so a Qdrant outage never crashes the API process.
  void runQdrantInitialization();
});

// LGPD/R38 — 90-day soft-delete purge job
// First run 60 s after startup, then every 24 h.
const PURGE_INITIAL_DELAY_MS = 60 * 1000;
const PURGE_INTERVAL_MS = 24 * 60 * 60 * 1000;

setTimeout(() => {
  purgeOldDeletedRecords().catch((err) => logger.error('Purge job failed', { err }));
  setInterval(() => {
    purgeOldDeletedRecords().catch((err) => logger.error('Purge job failed', { err }));
  }, PURGE_INTERVAL_MS);
}, PURGE_INITIAL_DELAY_MS);

// R18 — PROCESSING watchdog: every 5 minutes, fail documents stuck in PROCESSING for > 10 minutes.
setInterval(() => {
  const cutoff = new Date(Date.now() - 10 * 60 * 1000);
  prisma.document.updateMany({
    where: {
      status: DocumentStatus.PROCESSING,
      updatedAt: { lt: cutoff },
    },
    data: {
      status: DocumentStatus.FAILED,
      processingError: 'Processing timeout',
      processingDate: new Date(),
    },
  }).then((result) => {
    if (result.count > 0) {
      logger.warn(`Processing watchdog: marked ${result.count} stuck document(s) as FAILED`);
    }
  }).catch((err) => {
    logger.error('Processing watchdog failed', { err });
  });
}, 300000);

// B.1 — AccountingSync reconciliation: re-drive Won opportunities lacking a journal
// entry. Periodic, non-overlapping (process-local lock). Interval/delay configurable
// via env (defaults: 5 min interval, 1 min initial delay); no-op under NODE_ENV=test.
accountingSyncScheduler.start();

// Graceful shutdown
function gracefulShutdown() {
  logger.info('Shutting down gracefully...');
  accountingSyncScheduler.stop();

  // Force-exit safety net after 10 seconds
  const forceExitTimer = setTimeout(() => {
    logger.error('Graceful shutdown timed out — forcing exit', {});
    process.exit(1);
  }, 10000);
  // Allow the timer to be garbage-collected if shutdown completes in time
  if (forceExitTimer.unref) forceExitTimer.unref();

  httpServer.close(() => {
    logger.info('HTTP server closed');
    prisma.$disconnect().then(() => {
      logger.info('Database disconnected');
      process.exit(0);
    }).catch((err) => {
      logger.error('Error disconnecting database', { err });
      process.exit(1);
    });
  });
}

process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Promise Rejection', { reason });
  // do NOT exit — log and continue to avoid crashing on transient failures
});
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception — shutting down', { error });
  gracefulShutdown();
});

export default app;
