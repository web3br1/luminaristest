import { ValidationError } from '../../../../lib/errors';
import { MAX_CENTS } from '../../models/money';
import { isValidDateOnly } from '../../models/dates';
import type { AccountingScope } from '../../scope/AccountingScope';
import type { ReceivableService } from '../../services/ReceivableService';
import type { PostingService } from '../../services/PostingService';
import type { IReceivableRepository } from '../../repositories/IReceivableRepository';
import type { IAccountRepository } from '../../repositories/IAccountRepository';

/**
 * CrmReceivableBridge — post-commit integration adapter: CRM `Won` opportunity → AR subledger
 * (ADR-CRM-AR-SEAM, closes Council board-v2 N4 axis (a) — the orphan receivable).
 *
 * A Won deal is a right to receive, not cash: instead of the retired direct posting
 * (D 1.1.2 / C 3.1 via CrmOpportunityWonMapper, which parked the receivable forever — no CRM
 * settlement fact exists), the bridge creates a Receivable in the AR-formal subledger.
 * ReceivableService then books recognition (D 1.1.5 / C 3.1) and the payment FACT enters the
 * system where AR already defines it: a human registers the receipt (aging + settlement +
 * 1.1.5 tie-out come for free). Same altitude as the Salon*Bridges: invoked POST-COMMIT from
 * the CRM controller / reconcile job, never inside the DynamicTable engine (§2.1).
 *
 * Idempotency (two guards, both re-checked every pass):
 *  1. LEGACY: an opportunity already booked by the retired direct route (JournalEntry with
 *     sourceType 'crm.opportunity.won') is left alone — creating a receivable too would
 *     double-book revenue. Legacy 1.1.2 entries stay covered by the tie-out diagnostic.
 *  2. RECEIVABLE: documentNumber `CRM-<opportunityId>` is the business key. The lookup is
 *     tombstone-aware (matches the rename-on-delete form `deleted:<id>:CRM-<oppId>`), so a
 *     receivable the user CANCELLED is never resurrected — the cancel (with its reversal)
 *     stands as the human decision.
 * A same-instant live×reconcile race falls through to the @@unique key (P2002 fails one side;
 * the next reconcile pass classifies it as already booked).
 */

/** Retired direct-posting sourceType — kept ONLY as the legacy-era guard key. */
export const CRM_LEGACY_SOURCE_TYPE = 'crm.opportunity.won';

/** Revenue leaf for CRM deals (canonical chart). CRM has no line items, so the whole amount is
 *  service revenue. ponytail: single 3.1 credit is the ceiling — a Receivable carries ONE
 *  revenueAccountId, so a per-nature split (3.1×3.3) needs the AR model to grow line natures. */
export const CRM_REVENUE_ACCOUNT_CODE = '3.1';

/** Business key linking a receivable back to its opportunity. */
export function crmDocumentNumber(opportunityId: string): string {
  return `CRM-${opportunityId}`;
}

/** A Won opportunity normalized from its DynamicTable row (shared by live + reconcile paths). */
export interface WonOpportunityFact {
  opportunityId: string;
  unitId: string;
  /** Raw CRM amount in reais (JSON float) — converted to cents HERE, the money boundary. */
  amount: number;
  /** ISO datetime the deal closed — becomes issueDate AND dueDate (CRM has no due-date field). */
  occurredAt: string;
  /** Opportunity name — used as the customerName snapshot and entry description. */
  label: string;
  /** Scoped ref to the CRM account row (relation id), when present — stored as customerRef. */
  accountRef?: string;
}

export type CrmBridgeOutcome =
  | { outcome: 'created'; receivableId: string }
  | { outcome: 'already_booked' }
  | { outcome: 'legacy_entry' };

export class CrmReceivableBridge {
  constructor(
    private readonly receivableService: ReceivableService,
    private readonly receivableRepo: IReceivableRepository,
    private readonly accountRepo: IAccountRepository,
    private readonly posting: PostingService,
  ) {}

  /**
   * Book a Won opportunity into the AR subledger, idempotently. Throws ValidationError on a
   * malformed source fact (bad money / bad date / missing 3.1) — deterministic, NOT retriable;
   * callers isolate it (live path swallows+logs, reconcile counts it failed and continues).
   */
  public async bookWonOpportunity(
    scope: AccountingScope,
    fact: WonOpportunityFact,
  ): Promise<CrmBridgeOutcome> {
    const amountCents = this.toCents(fact);
    const dateOnly = this.toDateOnly(fact);

    // Guard 1 — legacy era: revenue already recognized by the retired direct route.
    const legacy = await this.posting.findEntryBySource(scope, CRM_LEGACY_SOURCE_TYPE, fact.opportunityId);
    if (legacy) return { outcome: 'legacy_entry' };

    // Guard 2 — receivable already exists (live OR tombstoned by a user cancel).
    const documentNumber = crmDocumentNumber(fact.opportunityId);
    const existing = await this.receivableRepo.findAnyByDocumentNumber(scope, documentNumber);
    if (existing) return { outcome: 'already_booked' };

    const revenueAccount = await this.accountRepo.findByCode(scope, CRM_REVENUE_ACCOUNT_CODE);
    if (!revenueAccount) {
      throw new ValidationError(
        `Conta de receita '${CRM_REVENUE_ACCOUNT_CODE}' não existe nesta unidade — plano de contas não semeado.`,
      );
    }

    const receivable = await this.receivableService.createReceivable(scope, {
      unitId: fact.unitId,
      customerName: fact.label,
      customerRef: fact.accountRef,
      documentNumber,
      description: `Receita CRM — ${fact.label}`,
      issueDate: dateOnly,
      dueDate: dateOnly, // ponytail: CRM has no dueDate; aging counts from close date
      amountCents,
      revenueAccountId: revenueAccount.id,
    });
    return { outcome: 'created', receivableId: receivable.id };
  }

  /** MONEY BOUNDARY (Contract §2.1): CRM float reais → integer cents, exactly once, hard guards. */
  private toCents(fact: WonOpportunityFact): number {
    if (typeof fact.amount !== 'number' || !Number.isFinite(fact.amount)) {
      throw new ValidationError(
        `Valor inválido para conta a receber (oportunidade '${fact.opportunityId}'): não é um número finito.`,
      );
    }
    const amountCents = Math.round(fact.amount * 100);
    if (!Number.isSafeInteger(amountCents) || amountCents > MAX_CENTS) {
      throw new ValidationError(
        `Valor fora da faixa segura de centavos (oportunidade '${fact.opportunityId}').`,
      );
    }
    if (amountCents <= 0) {
      throw new ValidationError(
        `Valor deve ser maior que zero para criar a conta a receber (oportunidade '${fact.opportunityId}').`,
      );
    }
    return amountCents;
  }

  /** closedAt ISO → date-only via literal slice (never Date round-trip), round-trip validated. */
  private toDateOnly(fact: WonOpportunityFact): string {
    const dateOnly = fact.occurredAt.slice(0, 10);
    if (!isValidDateOnly(dateOnly)) {
      throw new ValidationError(
        `Data de fechamento inválida para a oportunidade '${fact.opportunityId}': '${fact.occurredAt}'.`,
      );
    }
    return dateOnly;
  }
}
