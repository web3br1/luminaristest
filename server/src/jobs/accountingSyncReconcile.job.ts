/**
 * accountingSyncReconcile — durability backbone for AccountingSync (Incremento B).
 *
 * The live trigger (CRM controller, post-commit) is best-effort: if the posting
 * fails after the source fact commits, the journal entry is missing. This job
 * re-drives every `Won` opportunity that has no journal entry yet, idempotently.
 * It is a HARD requirement for the increment — without it a failed post is lost.
 *
 * The core `reconcileAccountingSync(deps)` is pure over injected collaborators
 * (unit-tested); `runAccountingSyncReconcile()` is the thin production wiring.
 */

import prisma from '../lib/prisma';
import { logger } from '../lib/logger';
import { getFactory } from '../lib/factory';
import { resolveAccountingScope } from '../features/accounting/scope/AccountingScope';
import type { AccountingScope } from '../features/accounting/scope/AccountingScope';
import { buildOpportunityWonEvent } from '../features/accounting/sync/AccountingSyncPort';
import type { AccountingEvent, SyncResult } from '../features/accounting/sync/AccountingSyncPort';
import { JournalEntryRepository } from '../features/accounting/repositories/JournalEntryRepository';

/** A `Won` opportunity normalized from its DynamicTable row, with its owning tenant. */
export interface WonOpportunity {
  /** Tenant that owns the source table — becomes owner AND actor in the re-drive. */
  ownerUserId: string;
  opportunityId: string;
  unitId: string;
  amount: number;
  currency: string;
  occurredAt: string;
  label: string;
}

export interface ReconcileDeps {
  listWonOpportunities: () => Promise<WonOpportunity[]>;
  hasExistingEntry: (
    scope: AccountingScope,
    sourceType: string,
    sourceId: string,
  ) => Promise<boolean>;
  sync: (scope: AccountingScope, event: AccountingEvent) => Promise<SyncResult>;
}

export interface ReconcileSummary {
  total: number;
  synced: number;
  idempotentHits: number;
  failed: number;
}

/**
 * Re-drive every Won opportunity lacking a journal entry. Idempotent and
 * fault-isolated: an isolated failure is logged and the batch continues.
 */
export async function reconcileAccountingSync(deps: ReconcileDeps): Promise<ReconcileSummary> {
  const opportunities = await deps.listWonOpportunities();
  const summary: ReconcileSummary = {
    total: opportunities.length,
    synced: 0,
    idempotentHits: 0,
    failed: 0,
  };

  for (const opp of opportunities) {
    try {
      if (!opp.unitId) {
        throw new Error(`Oportunidade '${opp.opportunityId}' sem unitId — não reconciliável.`);
      }
      // Owner-as-actor: no HTTP user in a job. The scope is built from the SOURCE
      // record's tenant + unit only — never crossing tenants or units.
      const scope = resolveAccountingScope({ userId: opp.ownerUserId }, opp.unitId);
      const event = buildOpportunityWonEvent({
        opportunityId: opp.opportunityId,
        unitId: opp.unitId,
        amount: opp.amount,
        currency: opp.currency,
        occurredAt: opp.occurredAt,
        label: opp.label,
      });

      // Classify already-booked opportunities (idempotent hit). sync() remains the
      // authority even if a race slips past this check — postEntry dedupes.
      const exists = await deps.hasExistingEntry(scope, event.sourceType, event.sourceId);
      if (exists) {
        summary.idempotentHits++;
        continue;
      }

      const result = await deps.sync(scope, event);
      summary.synced++;
      logger.info('Reconcile booked opportunity', {
        opportunityId: opp.opportunityId,
        entryId: result.entryId,
      });
    } catch (error) {
      // Isolated failure must NOT stop the batch.
      summary.failed++;
      logger.error('Reconcile failed for opportunity — continuing', {
        opportunityId: opp.opportunityId,
        error: error instanceof Error ? error.message : String(error),
      });
      continue;
    }
  }

  logger.info('Reconcile complete', { ...summary });
  return summary;
}

/** Production wiring: assemble real collaborators and run the reconciliation. */
export async function runAccountingSyncReconcile(): Promise<ReconcileSummary> {
  const factory = getFactory();
  const dtRepo = factory.getDynamicTableRepository();
  const sync = factory.getAccountingSyncService();
  const journalRepo = new JournalEntryRepository();

  return reconcileAccountingSync({
    listWonOpportunities: async () => {
      // Cross-tenant discovery: every crmOpportunities table (each owned by a userId).
      const tables = await prisma.dynamicTable.findMany({
        where: { internalName: 'crmOpportunities' },
        select: { id: true, userId: true },
      });
      const out: WonOpportunity[] = [];
      for (const table of tables) {
        const rows = await dtRepo.findRowsByFieldValue(table.id, 'status', 'Won');
        for (const row of rows) {
          const data = row.data as Record<string, unknown>;
          out.push({
            ownerUserId: table.userId,
            opportunityId: row.id,
            unitId: typeof data.unitId === 'string' ? data.unitId : '',
            amount: typeof data.amount === 'number' ? data.amount : NaN,
            currency: typeof data.currency === 'string' ? data.currency : 'BRL',
            occurredAt:
              typeof data.closedAt === 'string' ? data.closedAt : new Date().toISOString(),
            label: typeof data.name === 'string' ? data.name : `Oportunidade ${row.id}`,
          });
        }
      }
      return out;
    },
    hasExistingEntry: (scope, sourceType, sourceId) =>
      journalRepo.findBySource(scope, sourceType, sourceId).then((entry) => entry != null),
    sync: (scope, event) => sync.sync(scope, event),
  });
}
