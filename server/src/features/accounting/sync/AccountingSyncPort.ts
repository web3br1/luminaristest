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

import { AppError } from '../../../lib/errors';

/**
 * A domain fact that should produce a journal entry. Discriminated by `sourceType`.
 * The RAW source amount (reais, float) is carried here — conversion to integer
 * cents happens in the mapper (the money boundary), never before.
 */
export type AccountingEvent = {
  /** Stable event-kind key. Also the JournalEntry.sourceType (idempotency axis 1). */
  sourceType:
    | 'crm.opportunity.won'
    | 'salon.sale.finalized'
    | 'salon.sale.returned'
    | 'salon.sale.settled'
    | 'salon.package.sold';
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
  /**
   * Settlement only (Incremento D / D1): the sale's paymentMethod, used by
   * SalonSaleSettledMapper to pick the debit account (Caixa/Banco/A Receber Cartão/Pacotes
   * Pré-pagos). Undefined for every other event kind — the mapper that needs it validates it.
   */
  paymentMethod?: string;
  /**
   * Revenue-recognition events only (ADR-INCR-REVENUE-SPLIT): raw per-nature line subtotals
   * (reais), so the mapper can split the credit across `3.1 Receita de Serviços` and
   * `3.3 Receita de Revenda`. Carried by 'salon.sale.finalized' and — since the N4 seam fix —
   * accepted by 'crm.opportunity.won' too (CRM supplies none today: opportunities have no
   * line items, see CrmOpportunityWonMapper). When absent (or both zero), the mapper falls
   * back to a single `3.1` credit (backwards-compatible).
   */
  revenueByNature?: { serviceReais: number; productReais: number };
};

/** Result of a sync: the (possibly pre-existing, via idempotency) journal entry id. */
export interface SyncResult {
  entryId: string;
}

/**
 * Error codes the best-effort bridges skip+log (and the reconcile re-drive classifies as
 * BLOCKED, never retriable-failed). Project rule (`erro-especifico-para-skip-em-job`): skip
 * ONLY on a specific code, never on a base error class — anything else stays a loud failure
 * left for reconciliation.
 *   • ACCOUNTING_PERIOD_NOT_OPEN — transient by admin action (period reopens later);
 *   • MAX_CENTS_EXCEEDED — POISON: the source amount exceeds the Int32 ledger ceiling and the
 *     event can NEVER succeed until the source itself is fixed; retrying it every cycle is the
 *     infinite poison-loop Council 1.5 names.
 */
export const SYNC_SKIP_ERROR_CODES = ['ACCOUNTING_PERIOD_NOT_OPEN', 'MAX_CENTS_EXCEEDED'] as const;

/**
 * Returns the skip-listed code carried by `error`, or null when the error must NOT be skipped.
 * Reads `AppError.errorCode` — the previous inline checks in the bridges read a non-existent
 * `.code` property, so the period-closed skip NEVER fired (dead branch, fixed here for the class).
 */
export function syncSkipErrorCode(error: unknown): string | null {
  if (error instanceof AppError && (SYNC_SKIP_ERROR_CODES as readonly string[]).includes(error.errorCode)) {
    return error.errorCode;
  }
  return null;
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
  /** Raw per-nature subtotals (reais) for the revenue split (ADR-INCR-REVENUE-SPLIT / N4).
   *  Optional: CRM opportunities carry no line items today, so callers omit it and the mapper
   *  books a single `3.1` credit — the seam is split-CAPABLE the day CRM grows nature data. */
  revenueByNature?: { serviceReais: number; productReais: number };
}): AccountingEvent {
  return {
    sourceType: 'crm.opportunity.won',
    sourceId: fields.opportunityId,
    unitId: fields.unitId,
    amount: fields.amount,
    currency: fields.currency,
    occurredAt: fields.occurredAt,
    label: fields.label,
    revenueByNature: fields.revenueByNature,
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
  /** Raw per-nature subtotals (reais) for the revenue split (ADR-INCR-REVENUE-SPLIT). Optional:
   *  when omitted the mapper books a single `3.1` credit (backwards-compatible). */
  revenueByNature?: { serviceReais: number; productReais: number };
}): AccountingEvent {
  return {
    sourceType: 'salon.sale.finalized',
    sourceId: fields.saleId,
    unitId: fields.unitId,
    amount: fields.amount,
    currency: fields.currency,
    occurredAt: fields.occurredAt,
    label: fields.label,
    revenueByNature: fields.revenueByNature,
  };
}

/**
 * Pure builder for the salon "sale returned" event (Incremento D, devolução) — shared by
 * the reversal bridge (live trigger, post-commit) and the reconciliation job (re-drive) so
 * both emit identical events. Carries the raw float `totalAmount`; the mapper converts to
 * cents. A return is NOT a reversal of the finalized entry: it books a SEPARATE contra-revenue
 * entry (D 3.2 Devoluções / C 1.1.2 A Receber), so the original revenue stays posted and net
 * revenue is reduced by the return (D2-Q5: distinct effect from a cancellation).
 */
export function buildSalonSaleReturnedEvent(fields: {
  saleId: string;
  unitId: string;
  amount: number;
  currency: string;
  occurredAt: string;
  label: string;
}): AccountingEvent {
  return {
    sourceType: 'salon.sale.returned',
    sourceId: fields.saleId,
    unitId: fields.unitId,
    amount: fields.amount,
    currency: fields.currency,
    occurredAt: fields.occurredAt,
    label: fields.label,
  };
}

/**
 * Pure builder for the salon "sale settled" event (Incremento D / D1, baixa de A Receber) —
 * shared by the settlement bridge (live trigger, post-commit) and the reconciliation job
 * (re-drive) so both emit identical events. Carries the raw float `totalAmount` AND the
 * `paymentMethod` (the mapper needs it to pick the debit account); the mapper converts to cents.
 *
 * The settlement is recognized on status === 'Finalized' && paymentStatus === 'Paid' (D1-Q1).
 * It uses a DISTINCT sourceType ('salon.sale.settled') so it never collides with the revenue
 * entry ('salon.sale.finalized') on @@unique([userId,unitId,sourceType,sourceId]) — revenue and
 * settlement coexist for the same saleId. occurredAt should be the sale's paidAt (D1-Q2).
 */
export function buildSalonSaleSettledEvent(fields: {
  saleId: string;
  unitId: string;
  amount: number;
  currency: string;
  occurredAt: string;
  paymentMethod: string;
  label: string;
}): AccountingEvent {
  return {
    sourceType: 'salon.sale.settled',
    sourceId: fields.saleId,
    unitId: fields.unitId,
    amount: fields.amount,
    currency: fields.currency,
    occurredAt: fields.occurredAt,
    paymentMethod: fields.paymentMethod,
    label: fields.label,
  };
}

/**
 * Pure builder for the salon "package sold" event (Incremento G P4, origem) — shared by
 * the package-sold bridge (live trigger, post-commit) and the reconciliation job (re-drive)
 * so both emit identical events. Carries the raw float `totalAmount`; the mapper converts to
 * cents.
 *
 * An all-Package sale is prepaid: selling it does NOT recognize revenue (that is deferred to
 * consumption). It books the OBLIGATION instead — D 1.1.2 A Receber / C 2.1.1 Pacotes
 * Pré-pagos — under a DISTINCT sourceType ('salon.package.sold') so it never collides with the
 * (gated-out) revenue entry on @@unique([userId,unitId,sourceType,sourceId]).
 */
export function buildSalonPackageSoldEvent(fields: {
  saleId: string;
  unitId: string;
  amount: number;
  currency: string;
  occurredAt: string;
  label: string;
}): AccountingEvent {
  return {
    sourceType: 'salon.package.sold',
    sourceId: fields.saleId,
    unitId: fields.unitId,
    amount: fields.amount,
    currency: fields.currency,
    occurredAt: fields.occurredAt,
    label: fields.label,
  };
}
