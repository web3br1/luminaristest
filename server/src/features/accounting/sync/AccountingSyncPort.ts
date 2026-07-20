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
  sourceType:
    | 'crm.opportunity.won'
    | 'salon.sale.finalized'
    | 'salon.sale.cogs'
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
   * Finalized revenue only (ADR-INCR-REVENUE-SPLIT): raw per-nature line subtotals (reais), so
   * SalonSaleFinalizedMapper can split the credit across `3.1 Receita de Serviços` and
   * `3.3 Receita de Revenda`. Undefined for every other event kind. When absent (or both zero),
   * the mapper falls back to a single `3.1` credit (backwards-compatible).
   */
  revenueByNature?: { serviceReais: number; productReais: number };
  /**
   * Cost-of-goods only (INCR-INVENTORY, `salon.sale.cogs`): the sale's total CMV, ALREADY in
   * integer cents (computed by `InventoryService.recordSaleCogs` from the moving-average
   * subledger — D5/D6). Undefined for every other event kind. `SalonSaleCogsMapper` reads THIS
   * (never `amount`); the value never crosses a float boundary.
   */
  costCents?: number;
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
 * Pure builder for the salon "sale cost-of-goods" event (INCR-INVENTORY, Body 2 / O-2) — shared by
 * the finalized-sale bridge (live trigger, post-commit, 2nd emission after revenue) and the
 * reconciliation job (re-drive) so both emit identical events. Carries the CMV ALREADY in integer
 * cents (`costCents`, from `InventoryService.recordSaleCogs`); the mapper does NOT reconvert — it
 * only validates the Int. `amount` is unused for this event kind (set to 0), mirroring how
 * `paymentMethod`/`revenueByNature` are event-specific and read only by their own mapper.
 *
 * Uses a DISTINCT sourceType ('salon.sale.cogs') so the CMV entry (D 4.2 / C 1.1.6) never collides
 * with the revenue entry ('salon.sale.finalized') on @@unique([userId,unitId,sourceType,sourceId])
 * — revenue and CMV coexist for the same saleId. occurredAt should match the sale's date (the same
 * accounting date used for the revenue entry).
 */
export function buildSalonSaleCogsEvent(fields: {
  saleId: string;
  unitId: string;
  costCents: number;
  currency: string;
  occurredAt: string;
  label: string;
}): AccountingEvent {
  return {
    sourceType: 'salon.sale.cogs',
    sourceId: fields.saleId,
    unitId: fields.unitId,
    // amount is unused for this event kind — the mapper reads costCents (integer cents), never a float.
    amount: 0,
    costCents: fields.costCents,
    currency: fields.currency,
    occurredAt: fields.occurredAt,
    label: fields.label,
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
