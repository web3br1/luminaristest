/**
 * PurgeDeletedRecords — LGPD/R38 compliance job.
 *
 * Hard-deletes records that were soft-deleted more than 90 days ago.
 *
 * Models with a `deletedAt` column (as of schema inspection):
 *   - DynamicTableData  ✓
 *
 * User, DynamicTable, Document, ChatInstance, and ChatMessage do NOT have
 * a deletedAt column in the current schema and are therefore excluded.
 * Add them here if those columns are introduced in future migrations.
 */

import prisma from '../lib/prisma';
import { logger } from '../lib/logger';

const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000;

export async function purgeOldDeletedRecords(): Promise<void> {
  const cutoffDate = new Date(Date.now() - NINETY_DAYS_MS);

  logger.info(`[PurgeJob] Running purge for records soft-deleted before ${cutoffDate.toISOString()}`);

  // DynamicTableData — only model with deletedAt in current schema
  const dynamicTableDataResult = await prisma.dynamicTableData.deleteMany({
    where: { deletedAt: { lt: cutoffDate } },
  });
  logger.info(`[PurgeJob] DynamicTableData: purged ${dynamicTableDataResult.count} record(s)`);
}
