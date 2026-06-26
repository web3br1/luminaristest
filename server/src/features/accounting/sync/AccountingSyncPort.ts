/**
 * AccountingSync — application-level integration port (Incremento B).
 *
 * Lets a CONSUMER module (e.g. CRM) book a balanced journal entry when a domain
 * fact occurs, WITHOUT crossing the §2.1 boundary: this port lives in the
 * accounting (Prisma first-class) world, never inside the DynamicTable engine,
 * and is invoked POST-COMMIT from a controller / integration layer — never from
 * inside DynamicTableService.runInTransaction.
 *
 * Consistency model: the source event and the accounting posting are NOT a single
 * distributed transaction (postEntry opens its own root tx; SQLite can't nest).
 * The posting is eventually consistent and made safe by PostingService's built-in
 * idempotency on (sourceType, sourceId) — see ADR-B01.
 */

/**
 * A domain fact that should produce a journal entry. Discriminated by `sourceType`.
 * The RAW source amount (reais, float) is carried here — conversion to integer
 * cents happens in the mapper (the money boundary), never before.
 */
export type AccountingEvent = {
  /** Stable event-kind key. Also the JournalEntry.sourceType (idempotency axis 1). */
  sourceType: 'crm.opportunity.won' | 'salon.sale.finalized';
  /** The source record id. JournalEntry.sourceId (idempotency axis 2). */
  sourceId: string;
  /** Tenancy unit of the SOURCE record — never defaulted or inferred elsewhere. */
  unitId: string;
  /** Raw monetary amount in currency units (reais, float). Mapper → integer cents. */
  amount: number;
  /** Currency code of the source amount. */
  currency: string;
  /** When the fact occurred (ISO) — used as the accounting date. */
  occurredAt: string;
  /** Human label for the entry description. */
  label: string;
};

/** Result of a sync: the (possibly pre-existing, via idempotency) journal entry id. */
export interface SyncResult {
  entryId: string;
}

/**
 * The integration port. Implementations resolve the event to a balanced
 * PostEntryInput (via a mapper) and delegate to PostingService.postEntry —
 * which owns the balance invariant, atomicity and idempotency.
 */
export interface AccountingSyncPort {
  sync(scope: import('../scope/AccountingScope').AccountingScope, event: AccountingEvent): Promise<SyncResult>;
}

/**
 * Pure builder for the CRM "opportunity won" event — shared by the controller
 * (live trigger) and the reconciliation job (re-drive) so both emit identical
 * events. Carries the raw float amount; the mapper converts to cents.
 */
export function buildOpportunityWonEvent(fields: {
  opportunityId: string;
  unitId: string;
  amount: number;
  currency: string;
  occurredAt: string;
  label: string;
}): AccountingEvent {
  return {
    sourceType: 'crm.opportunity.won',
    sourceId: fields.opportunityId,
    unitId: fields.unitId,
    amount: fields.amount,
    currency: fields.currency,
    occurredAt: fields.occurredAt,
    label: fields.label,
  };
}

/**
 * Pure builder for the salon "sale finalized" event (Incremento C) — shared by the
 * bridge (live trigger, post-commit) and the reconciliation job (re-drive) so both
 * emit identical events. Carries the raw float `totalAmount`; the mapper converts to
 * cents. The accounting fact is recognized on sale.status === 'Finalized' regardless
 * of paymentStatus (revenue → A Receber); settlement is a separate Incremento D.
 */
export function buildSalonSaleFinalizedEvent(fields: {
  saleId: string;
  unitId: string;
  amount: number;
  currency: string;
  occurredAt: string;
  label: string;
}): AccountingEvent {
  return {
    sourceType: 'salon.sale.finalized',
    sourceId: fields.saleId,
    unitId: fields.unitId,
    amount: fields.amount,
    currency: fields.currency,
    occurredAt: fields.occurredAt,
    label: fields.label,
  };
}
