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
import {
  buildOpportunityWonEvent,
  buildSalonSaleFinalizedEvent,
} from '../features/accounting/sync/AccountingSyncPort';
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

// ───────────────────────────────────────────────────────────────────────────
// Salon sales pass (Incremento C, ADR-C01) — re-drive every Finalized salon sale
// that has no journal entry yet. Same durability contract as the CRM pass: the
// live trigger (DynamicTable controller, post-commit) is best-effort; this job is
// the safety net (and the only coverage for a sale born Finalized via create).
// ───────────────────────────────────────────────────────────────────────────

/** A `Finalized` salon sale normalized from its DynamicTable row, with its owning tenant. */
export interface FinalizedSale {
  /** Tenant that owns the source table — becomes owner AND actor in the re-drive. */
  ownerUserId: string;
  saleId: string;
  unitId: string;
  amount: number;
  currency: string;
  occurredAt: string;
}

export interface SalonReconcileDeps {
  listFinalizedSales: () => Promise<FinalizedSale[]>;
  hasExistingEntry: (
    scope: AccountingScope,
    sourceType: string,
    sourceId: string,
  ) => Promise<boolean>;
  sync: (scope: AccountingScope, event: AccountingEvent) => Promise<SyncResult>;
}

/**
 * Re-drive every Finalized salon sale lacking a journal entry. Idempotent and
 * fault-isolated: an isolated failure is logged and the batch continues. Mirrors
 * reconcileAccountingSync; kept as a separate core so each source stays independently
 * testable and the CRM contract is untouched.
 */
export async function reconcileSalonSales(deps: SalonReconcileDeps): Promise<ReconcileSummary> {
  const sales = await deps.listFinalizedSales();
  const summary: ReconcileSummary = {
    total: sales.length,
    synced: 0,
    idempotentHits: 0,
    failed: 0,
  };

  for (const sale of sales) {
    try {
      if (!sale.unitId) {
        throw new Error(`Venda '${sale.saleId}' sem unitId — não reconciliável.`);
      }
      // Owner-as-actor: no HTTP user in a job. The scope is built from the SOURCE
      // record's tenant + unit only — never crossing tenants or units.
      const scope = resolveAccountingScope({ userId: sale.ownerUserId }, sale.unitId);
      const event = buildSalonSaleFinalizedEvent({
        saleId: sale.saleId,
        unitId: sale.unitId,
        amount: sale.amount,
        currency: sale.currency,
        occurredAt: sale.occurredAt,
        label: `Venda ${sale.saleId}`,
      });

      // Classify already-booked sales (idempotent hit). sync() remains the authority
      // even if a race slips past this check — postEntry dedupes.
      const exists = await deps.hasExistingEntry(scope, event.sourceType, event.sourceId);
      if (exists) {
        summary.idempotentHits++;
        continue;
      }

      const result = await deps.sync(scope, event);
      summary.synced++;
      logger.info('Reconcile booked salon sale', {
        saleId: sale.saleId,
        entryId: result.entryId,
      });
    } catch (error) {
      // Isolated failure must NOT stop the batch.
      summary.failed++;
      logger.error('Reconcile failed for salon sale — continuing', {
        saleId: sale.saleId,
        error: error instanceof Error ? error.message : String(error),
      });
      continue;
    }
  }

  logger.info('Salon sales reconcile complete', { ...summary });
  return summary;
}

/** Sum two summaries into one (the job runs CRM + salon passes and reports the total). */
function mergeSummaries(a: ReconcileSummary, b: ReconcileSummary): ReconcileSummary {
  return {
    total: a.total + b.total,
    synced: a.synced + b.synced,
    idempotentHits: a.idempotentHits + b.idempotentHits,
    failed: a.failed + b.failed,
  };
}

/** Production wiring: assemble real collaborators and run BOTH reconciliation passes. */
export async function runAccountingSyncReconcile(): Promise<ReconcileSummary> {
  const factory = getFactory();
  const dtRepo = factory.getDynamicTableRepository();
  const sync = factory.getAccountingSyncService();
  const journalRepo = new JournalEntryRepository();

  const hasExistingEntry = (scope: AccountingScope, sourceType: string, sourceId: string) =>
    journalRepo.findBySource(scope, sourceType, sourceId).then((entry) => entry != null);
  const doSync = (scope: AccountingScope, event: AccountingEvent) => sync.sync(scope, event);

  const crm = await reconcileAccountingSync({
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
    hasExistingEntry,
    sync: doSync,
  });

  const salon = await reconcileSalonSales({
    listFinalizedSales: async () => {
      // Cross-tenant discovery: every salon `sales` table (each owned by a userId).
      const tables = await prisma.dynamicTable.findMany({
        where: { internalName: 'sales' },
        select: { id: true, userId: true },
      });
      const out: FinalizedSale[] = [];
      for (const table of tables) {
        const rows = await dtRepo.findRowsByFieldValue(table.id, 'status', 'Finalized');
        for (const row of rows) {
          const data = row.data as Record<string, unknown>;
          out.push({
            ownerUserId: table.userId,
            saleId: row.id,
            unitId: typeof data.unitId === 'string' ? data.unitId : '',
            amount: typeof data.totalAmount === 'number' ? data.totalAmount : NaN,
            currency: typeof data.currency === 'string' ? data.currency : 'BRL',
            occurredAt: typeof data.date === 'string' ? data.date : new Date().toISOString(),
          });
        }
      }
      return out;
    },
    hasExistingEntry,
    sync: doSync,
  });

  return mergeSummaries(crm, salon);
}
