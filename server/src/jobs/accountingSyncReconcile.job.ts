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
  buildSalonSaleReturnedEvent,
  buildSalonSaleSettledEvent,
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
  /**
   * Settlement pass only (Incremento D / D1): sales Finalized+Paid whose revenue entry is not yet
   * booked, so the settlement is deliberately deferred (NOT a failure) — left for a later run once
   * the revenue exists. Optional so the other passes keep their exact 4-field summary unchanged.
   */
  blocked?: number;
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

// ───────────────────────────────────────────────────────────────────────────
// Salon reversals pass (Incremento D) — the durability net for the post-commit
// SalonSaleReversalBridge. Same contract as the finalize passes: the live trigger
// (SalesCancellationService, post-commit) is best-effort; these passes re-drive any
// transition whose accounting effect failed, idempotently.
//
//  • reconcileSalonCancellations: status Cancelled whose 'salon.sale.finalized' entry is
//    still 'Posted' (not 'Reversed') → re-fire reverseEntry.
//  • reconcileSalonReturns: status Returned with no 'salon.sale.returned' entry → re-fire sync.
// ───────────────────────────────────────────────────────────────────────────

/** A `Cancelled` salon sale normalized from its DynamicTable row, with its owning tenant. */
export interface CancelledSale {
  ownerUserId: string;
  saleId: string;
  unitId: string;
}

export interface SalonCancellationReconcileDeps {
  listCancelledSales: () => Promise<CancelledSale[]>;
  /** Locate an entry by source within the scope (returns its id + status, or null). */
  findEntry: (
    scope: AccountingScope,
    sourceType: string,
    sourceId: string,
  ) => Promise<{ id: string; status: string } | null>;
  /** Reverse a posted entry (idempotent in PostingService). */
  reverse: (scope: AccountingScope, unitId: string, entryId: string) => Promise<void>;
}

/**
 * Re-drive every Cancelled salon sale whose revenue (and, when present, settlement) entry is
 * still Posted. reverseEntry is the idempotency authority, so a sale already reversed is a
 * no-op classified as an idempotent hit. Fault-isolated: an isolated failure is logged and the
 * batch continues.
 */
export async function reconcileSalonCancellations(
  deps: SalonCancellationReconcileDeps,
): Promise<ReconcileSummary> {
  const sales = await deps.listCancelledSales();
  const summary: ReconcileSummary = { total: sales.length, synced: 0, idempotentHits: 0, failed: 0 };

  for (const sale of sales) {
    try {
      if (!sale.unitId) {
        throw new Error(`Venda '${sale.saleId}' sem unitId — não reconciliável.`);
      }
      const scope = resolveAccountingScope({ userId: sale.ownerUserId }, sale.unitId);

      let didReverse = false;
      // Revenue + (adaptive D2-Q4) settlement: reverse each that is still Posted.
      for (const sourceType of ['salon.sale.finalized', 'salon.sale.settled']) {
        const entry = await deps.findEntry(scope, sourceType, sale.saleId);
        if (entry && entry.status === 'Posted') {
          await deps.reverse(scope, sale.unitId, entry.id);
          didReverse = true;
        }
      }

      if (didReverse) {
        summary.synced++;
        logger.info('Reconcile reversed cancelled sale', { saleId: sale.saleId });
      } else {
        // Nothing Posted to reverse (already reversed, or never booked) — idempotent.
        summary.idempotentHits++;
      }
    } catch (error) {
      summary.failed++;
      logger.error('Reconcile failed for cancelled sale — continuing', {
        saleId: sale.saleId,
        error: error instanceof Error ? error.message : String(error),
      });
      continue;
    }
  }

  logger.info('Salon cancellations reconcile complete', { ...summary });
  return summary;
}

/** A `Returned` salon sale normalized from its DynamicTable row, with its owning tenant. */
export interface ReturnedSale {
  ownerUserId: string;
  saleId: string;
  unitId: string;
  amount: number;
  currency: string;
  occurredAt: string;
}

export interface SalonReturnReconcileDeps {
  listReturnedSales: () => Promise<ReturnedSale[]>;
  hasExistingEntry: (
    scope: AccountingScope,
    sourceType: string,
    sourceId: string,
  ) => Promise<boolean>;
  sync: (scope: AccountingScope, event: AccountingEvent) => Promise<SyncResult>;
}

/**
 * Re-drive every Returned salon sale lacking a 'salon.sale.returned' contra-revenue entry.
 * Mirrors reconcileSalonSales (sync of a new entry, not a reversal). Idempotent and
 * fault-isolated.
 */
export async function reconcileSalonReturns(deps: SalonReturnReconcileDeps): Promise<ReconcileSummary> {
  const sales = await deps.listReturnedSales();
  const summary: ReconcileSummary = { total: sales.length, synced: 0, idempotentHits: 0, failed: 0 };

  for (const sale of sales) {
    try {
      if (!sale.unitId) {
        throw new Error(`Venda '${sale.saleId}' sem unitId — não reconciliável.`);
      }
      const scope = resolveAccountingScope({ userId: sale.ownerUserId }, sale.unitId);
      const event = buildSalonSaleReturnedEvent({
        saleId: sale.saleId,
        unitId: sale.unitId,
        amount: sale.amount,
        currency: sale.currency,
        occurredAt: sale.occurredAt,
        label: `Devolução ${sale.saleId}`,
      });

      // Classify already-booked returns (idempotent hit). sync() remains the authority even if
      // a race slips past this check — postEntry dedupes on (sourceType, sourceId).
      const exists = await deps.hasExistingEntry(scope, event.sourceType, event.sourceId);
      if (exists) {
        summary.idempotentHits++;
        continue;
      }

      const result = await deps.sync(scope, event);
      summary.synced++;
      logger.info('Reconcile booked salon return', { saleId: sale.saleId, entryId: result.entryId });
    } catch (error) {
      summary.failed++;
      logger.error('Reconcile failed for salon return — continuing', {
        saleId: sale.saleId,
        error: error instanceof Error ? error.message : String(error),
      });
      continue;
    }
  }

  logger.info('Salon returns reconcile complete', { ...summary });
  return summary;
}

/** A `Finalized` + `Paid` salon sale normalized from its DynamicTable row, with its owning tenant. */
export interface SettledSale {
  ownerUserId: string;
  saleId: string;
  unitId: string;
  amount: number;
  currency: string;
  occurredAt: string;
  paymentMethod: string;
}

export interface SalonSettlementReconcileDeps {
  listSettledSales: () => Promise<SettledSale[]>;
  hasExistingEntry: (
    scope: AccountingScope,
    sourceType: string,
    sourceId: string,
  ) => Promise<boolean>;
  sync: (scope: AccountingScope, event: AccountingEvent) => Promise<SyncResult>;
}

/**
 * Re-drive every Finalized+Paid salon sale lacking a 'salon.sale.settled' entry — the durability
 * net for the post-commit SalonSaleSettlementBridge (and the only coverage for a sale born
 * Finalized+Paid). Mirrors reconcileSalonSales (sync of a new entry, not a reversal).
 *
 * ORDERING: the settlement clears A Receber, which only exists if the revenue entry was booked. A
 * sale Finalized+Paid whose 'salon.sale.finalized' entry is still missing is counted as BLOCKED
 * (deferred), NOT failed — a later run settles it once the revenue pass has booked the receivable.
 * Idempotent and fault-isolated: an isolated failure is logged and the batch continues.
 */
export async function reconcileSalonSettlements(
  deps: SalonSettlementReconcileDeps & {
    /** True when the revenue entry already exists (settlement may proceed). */
    hasRevenueEntry: (scope: AccountingScope, sourceId: string) => Promise<boolean>;
  },
): Promise<ReconcileSummary> {
  const sales = await deps.listSettledSales();
  const summary: ReconcileSummary = {
    total: sales.length,
    synced: 0,
    idempotentHits: 0,
    failed: 0,
    blocked: 0,
  };

  for (const sale of sales) {
    try {
      if (!sale.unitId) {
        throw new Error(`Venda '${sale.saleId}' sem unitId — não reconciliável.`);
      }
      const scope = resolveAccountingScope({ userId: sale.ownerUserId }, sale.unitId);

      // Already settled? idempotent hit (sync stays the authority even if a race slips past).
      const exists = await deps.hasExistingEntry(scope, 'salon.sale.settled', sale.saleId);
      if (exists) {
        summary.idempotentHits++;
        continue;
      }

      // Ordering gate: without the revenue entry there is no A Receber to clear — defer (blocked),
      // do NOT fail the batch (blocked_missing_revenue_entry).
      const hasRevenue = await deps.hasRevenueEntry(scope, sale.saleId);
      if (!hasRevenue) {
        summary.blocked = (summary.blocked ?? 0) + 1;
        logger.warn('Reconcile settlement blocked — revenue entry missing', { saleId: sale.saleId });
        continue;
      }

      const event = buildSalonSaleSettledEvent({
        saleId: sale.saleId,
        unitId: sale.unitId,
        amount: sale.amount,
        currency: sale.currency,
        occurredAt: sale.occurredAt,
        paymentMethod: sale.paymentMethod,
        label: `Liquidação ${sale.saleId}`,
      });

      const result = await deps.sync(scope, event);
      summary.synced++;
      logger.info('Reconcile booked salon settlement', {
        saleId: sale.saleId,
        entryId: result.entryId,
      });
    } catch (error) {
      summary.failed++;
      logger.error('Reconcile failed for salon settlement — continuing', {
        saleId: sale.saleId,
        error: error instanceof Error ? error.message : String(error),
      });
      continue;
    }
  }

  logger.info('Salon settlements reconcile complete', { ...summary });
  return summary;
}

/** Sum two summaries into one (the job runs CRM + salon passes and reports the total). */
function mergeSummaries(a: ReconcileSummary, b: ReconcileSummary): ReconcileSummary {
  return {
    total: a.total + b.total,
    synced: a.synced + b.synced,
    idempotentHits: a.idempotentHits + b.idempotentHits,
    failed: a.failed + b.failed,
    blocked: (a.blocked ?? 0) + (b.blocked ?? 0),
  };
}

/** Production wiring: assemble real collaborators and run BOTH reconciliation passes. */
export async function runAccountingSyncReconcile(): Promise<ReconcileSummary> {
  const factory = getFactory();
  const dtRepo = factory.getDynamicTableRepository();
  const sync = factory.getAccountingSyncService();
  const posting = factory.getPostingService();
  const journalRepo = new JournalEntryRepository();

  const hasExistingEntry = (scope: AccountingScope, sourceType: string, sourceId: string) =>
    journalRepo.findBySource(scope, sourceType, sourceId).then((entry) => entry != null);
  const doSync = (scope: AccountingScope, event: AccountingEvent) => sync.sync(scope, event);

  // For the cancellations pass: locate an entry (id + status) and reverse it via PostingService.
  const findEntry = (scope: AccountingScope, sourceType: string, sourceId: string) =>
    journalRepo
      .findBySource(scope, sourceType, sourceId)
      .then((entry) => (entry ? { id: entry.id, status: entry.status } : null));
  const reverse = async (scope: AccountingScope, unitId: string, entryId: string) => {
    await posting.reverseEntry(scope, { unitId, lancamentoId: entryId });
  };

  /** Normalize the salon `sales` rows of a given status across every tenant. */
  const listSalesByStatus = async (status: string) => {
    const tables = await prisma.dynamicTable.findMany({
      where: { internalName: 'sales' },
      select: { id: true, userId: true },
    });
    const out: Array<{ ownerUserId: string; row: { id: string; data: Record<string, unknown> } }> = [];
    for (const table of tables) {
      const rows = await dtRepo.findRowsByFieldValue(table.id, 'status', status);
      for (const row of rows) {
        out.push({ ownerUserId: table.userId, row: { id: row.id, data: row.data as Record<string, unknown> } });
      }
    }
    return out;
  };

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

  const cancellations = await reconcileSalonCancellations({
    listCancelledSales: async () => {
      const found = await listSalesByStatus('Cancelled');
      return found.map(({ ownerUserId, row }) => ({
        ownerUserId,
        saleId: row.id,
        unitId: typeof row.data.unitId === 'string' ? row.data.unitId : '',
      }));
    },
    findEntry,
    reverse,
  });

  const returns = await reconcileSalonReturns({
    listReturnedSales: async () => {
      const found = await listSalesByStatus('Returned');
      return found.map(({ ownerUserId, row }) => ({
        ownerUserId,
        saleId: row.id,
        unitId: typeof row.data.unitId === 'string' ? row.data.unitId : '',
        amount: typeof row.data.totalAmount === 'number' ? row.data.totalAmount : NaN,
        currency: typeof row.data.currency === 'string' ? row.data.currency : 'BRL',
        occurredAt:
          typeof row.data.returnedAt === 'string'
            ? row.data.returnedAt
            : typeof row.data.date === 'string'
              ? row.data.date
              : new Date().toISOString(),
      }));
    },
    hasExistingEntry,
    sync: doSync,
  });

  const settlements = await reconcileSalonSettlements({
    listSettledSales: async () => {
      // Cross-tenant discovery: Finalized sales whose payment is Paid (the settlement trigger).
      const found = await listSalesByStatus('Finalized');
      return found
        .filter(({ row }) => row.data.paymentStatus === 'Paid')
        .map(({ ownerUserId, row }) => ({
          ownerUserId,
          saleId: row.id,
          unitId: typeof row.data.unitId === 'string' ? row.data.unitId : '',
          amount: typeof row.data.totalAmount === 'number' ? row.data.totalAmount : NaN,
          currency: typeof row.data.currency === 'string' ? row.data.currency : 'BRL',
          occurredAt:
            typeof row.data.paidAt === 'string'
              ? row.data.paidAt
              : typeof row.data.date === 'string'
                ? row.data.date
                : new Date().toISOString(),
          paymentMethod: typeof row.data.paymentMethod === 'string' ? row.data.paymentMethod : '',
        }));
    },
    hasExistingEntry,
    // Ordering gate: settle only once the revenue receivable exists.
    hasRevenueEntry: (scope: AccountingScope, sourceId: string) =>
      hasExistingEntry(scope, 'salon.sale.finalized', sourceId),
    sync: doSync,
  });

  return [crm, salon, cancellations, returns, settlements].reduce(mergeSummaries);
}
