import { AccountingPeriodNotOpenError, ValidationError } from '../../../../lib/errors';
import logger from '../../../../lib/logger';
import { MAX_CENTS } from '../../models/money';
import { isValidDateOnly } from '../../models/dates';
import type { Receivable } from 'generated/prisma';
import type { AccountingScope } from '../../scope/AccountingScope';
import type { ReceivableService } from '../../services/ReceivableService';
import type { PostingService } from '../../services/PostingService';
import type { IReceivableRepository } from '../../repositories/IReceivableRepository';
import type { IAccountRepository } from '../../repositories/IAccountRepository';
import type { IAccountingPeriodRepository } from '../../repositories/IAccountingPeriodRepository';

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
 * Idempotency (two guards, both re-checked every pass; review-hardened):
 *  1. LEGACY: an opportunity already booked by the retired direct route (JournalEntry with
 *     sourceType 'crm.opportunity.won') is left alone — creating a receivable too would
 *     double-book revenue. Applies regardless of entry status: a human who REVERSED a legacy
 *     entry made a final call; the bridge never re-books over it (review L2, deliberate).
 *  2. RECEIVABLE: documentNumber `CRM-<opportunityId>` is the business key. All rows carrying
 *     it (live or rename-on-delete tombstoned) are CLASSIFIED, not blanket-blocked:
 *       - live row → already booked;
 *       - tombstone WITH cancelledById → human cancel, final decision, never resurrected;
 *       - tombstone WITHOUT cancelledById → machine compensation of a FAILED recognition
 *         (compensateFailedRecognition sets no actor) → RETRYABLE, else a transient posting
 *         failure would silently lose the revenue forever (review H1).
 *  3. RACE (live trigger × reconcile on the same instant, opportunity renamed in between so the
 *     customerName-bearing @@unique cannot collide — review M1): a post-create sweep keeps the
 *     deterministic survivor (lowest id) and cancels the duplicate this call created; both
 *     racers apply the same rule, so exactly one receivable remains.
 */

import { CRM_LEGACY_SOURCE_TYPE } from '../AccountingSyncPort';

export { CRM_LEGACY_SOURCE_TYPE };

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
    private readonly periodRepo: IAccountingPeriodRepository,
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
    const documentNumber = crmDocumentNumber(fact.opportunityId);

    // Guard 1 — legacy era: revenue already recognized by the retired direct route.
    const legacy = await this.posting.findEntryBySource(scope, CRM_LEGACY_SOURCE_TYPE, fact.opportunityId);
    if (legacy) return { outcome: 'legacy_entry' };

    // Guard 2 — classify every row carrying the business key (live / human-cancel / compensation).
    // A pass that finds live TWINS (leftover of a race whose sweep failed) converges them first,
    // so convergence is re-driven by EVERY pass, not only by the pass that created the duplicate
    // (review R1 — the sweep is never single-shot).
    const existing = await this.receivableRepo.findAllByDocumentNumber(scope, documentNumber);
    const liveRows = existing.filter((r) => r.deletedAt === null && r.documentNumber === documentNumber);
    if (liveRows.length > 1) {
      await this.convergeTwins(scope, fact.unitId, liveRows);
      return { outcome: 'already_booked' };
    }
    if (this.isAlreadyBooked(existing, documentNumber)) return { outcome: 'already_booked' };

    // Source-fact validation AFTER the idempotency guards (review L1): an already-booked
    // opportunity whose data was later corrupted classifies as booked instead of failing forever.
    const amountCents = this.toCents(fact);
    const dateOnly = this.toDateOnly(fact);

    // PERIOD PREFLIGHT (review R2): a deterministic period failure must NOT create the row —
    // otherwise every reconcile pass would mint row + audit + compensation tombstone without
    // ceiling. Non-authoritative (the in-tx gate in postEntry stays the authority); this only
    // keeps the failure clean, matching the retired direct route (which failed row-free).
    await this.assertPeriodOpen(scope, dateOnly);

    const revenueAccount = await this.resolveRevenueAccount(scope);

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

    // Race sweep (review M1): if a concurrent racer slipped past guard 2 under a DIFFERENT
    // customerName snapshot (rename window), two live rows now share the key. Converge to the
    // deterministic survivor; a failed cancel here is retried by the guard-2 sweep of any later
    // pass (review R1).
    const after = await this.receivableRepo.findAllByDocumentNumber(scope, documentNumber);
    const liveTwins = after.filter((r) => r.deletedAt === null && r.documentNumber === documentNumber);
    if (liveTwins.length > 1) {
      const survivor = await this.convergeTwins(scope, fact.unitId, liveTwins);
      if (survivor.id !== receivable.id) return { outcome: 'already_booked' };
    }

    return { outcome: 'created', receivableId: receivable.id };
  }

  /**
   * Converge live twins sharing the CRM business key to ONE survivor. Survivor = lowest id —
   * deterministic on both racers; later-created rows sort higher because Prisma cuids are
   * timestamp-prefixed and this app is single-process (review R3 — documented assumption; with
   * non-monotonic ids the rule stays deterministic, just not "oldest wins"). Only OPEN twins are
   * cancelled (cancel = estorno, netting the duplicate recognition to zero): a RECEIVING/RECEIVED
   * twin means a human already engaged with it — never cancel money movement under them (warn
   * instead). A failed cancel is logged and retried by the next pass's guard-2 sweep.
   */
  private async convergeTwins(
    scope: AccountingScope,
    unitId: string,
    twins: Receivable[],
  ): Promise<Receivable> {
    const survivor = twins.reduce((a, b) => (a.id < b.id ? a : b));
    for (const twin of twins) {
      if (twin.id === survivor.id) continue;
      if (twin.status !== 'OPEN') {
        logger.warn('CRM twin receivable not OPEN — human engaged, not auto-cancelling', {
          receivableId: twin.id,
          status: twin.status,
        });
        continue;
      }
      try {
        await this.receivableService.cancelReceivable(scope, twin.id, {
          unitId,
          reversalDate: twin.issueDate.toISOString().slice(0, 10),
          reason: 'Duplicata de corrida live×reconcile (ADR-CRM-AR-SEAM) — sobrevive o id mais antigo.',
        });
      } catch (error) {
        logger.warn('CRM twin cancel failed — next pass re-drives the sweep', {
          receivableId: twin.id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return survivor;
  }

  /**
   * Preflight period gate (outside tx; mirrors PostingService.assertPeriodOpen). Reads the
   * SAME UTC year/month the authoritative in-tx gate will read from the date-only string.
   */
  private async assertPeriodOpen(scope: AccountingScope, dateOnly: string): Promise<void> {
    const year = Number(dateOnly.slice(0, 4));
    const month = Number(dateOnly.slice(5, 7));
    const period = await this.periodRepo.findByYearMonth(scope, year, month);
    if (!period || period.status !== 'OPEN') {
      throw new AccountingPeriodNotOpenError(year, month);
    }
  }

  /**
   * Guard-2 classifier. Blocking rows: a LIVE receivable with the exact key, or a tombstone in
   * the STRICT rename-on-delete shape (`deleted:<one-segment-id>:<doc>` — a manual receivable
   * whose own documentNumber merely ends with `:<doc>` never matches, review L3) that carries a
   * cancelledById (human cancel). Actor-less tombstones are machine compensations → retryable.
   */
  private isAlreadyBooked(rows: Receivable[], documentNumber: string): boolean {
    const suffix = `:${documentNumber}`;
    const isStrictTombstone = (dn: string): boolean => {
      if (!dn.startsWith('deleted:') || !dn.endsWith(suffix)) return false;
      const middle = dn.slice('deleted:'.length, dn.length - suffix.length);
      return middle.length > 0 && !middle.includes(':');
    };
    return rows.some((row) => {
      if (row.deletedAt === null) return row.documentNumber === documentNumber;
      if (!row.documentNumber || !isStrictTombstone(row.documentNumber)) return false;
      return row.cancelledById !== null;
    });
  }

  /** Resolve the 3.1 leaf; on a chart never touched by accounting (CRM-first tenant, review M2),
   *  trigger the idempotent canonical seed once via the public listAccounts before giving up. */
  private async resolveRevenueAccount(scope: AccountingScope) {
    let account = await this.accountRepo.findByCode(scope, CRM_REVENUE_ACCOUNT_CODE);
    if (!account) {
      await this.posting.listAccounts(scope); // idempotently seeds CANONICAL_ACCOUNTS
      account = await this.accountRepo.findByCode(scope, CRM_REVENUE_ACCOUNT_CODE);
    }
    if (!account) {
      throw new ValidationError(
        `Conta de receita '${CRM_REVENUE_ACCOUNT_CODE}' não existe nesta unidade — plano de contas não semeado.`,
      );
    }
    return account;
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
