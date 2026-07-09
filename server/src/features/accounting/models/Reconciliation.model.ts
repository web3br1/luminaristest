import type { BankStatementLine, Posting } from 'generated/prisma';

/**
 * Domain types for bank reconciliation (BE-INCR-7 / ADR-INCR7).
 * The module links statement lines to existing postings — it never writes
 * ledger money values; the only ledger write is the derived JournalEntry
 * status flip Posted<->Reconciled (D5), owned by the service layer.
 */

/** Lifecycle of an imported statement line (staging; immutable rows). */
export type BankStatementLineStatus = 'UNMATCHED' | 'MATCHED' | 'IGNORED';

/** How a match was produced (D6). */
export type ReconciliationMatchType = 'AUTO' | 'MANUAL';

/** Insert shape for a statement header (D1/D4). */
export interface CreateBankStatementInput {
  userId: string;
  unitId: string;
  glAccountId: string;
  statementRef?: string | null;
  periodStart: Date;
  periodEnd: Date;
  openingBalanceCents?: number | null;
  closingBalanceCents?: number | null;
  sha256: string;
  attachmentId?: string | null;
  importedById?: string | null;
}

/** Insert shape for one parsed line (amountCents SIGNED: >0 inflow, <0 outflow). */
export interface CreateBankStatementLineInput {
  userId: string;
  unitId: string;
  statementId: string;
  lineNumber: number;
  date: Date;
  amountCents: number;
  description: string;
  externalRef?: string | null;
  rawJson: string;
}

/** Insert shape for a statement-line <-> posting link. */
export interface CreateReconciliationMatchInput {
  userId: string;
  unitId: string;
  statementLineId: string;
  postingId: string;
  matchType: ReconciliationMatchType;
  matchedById?: string | null;
}

/**
 * Candidate query for auto/manual match (D6): postings on the bank GL account,
 * with the exact cent amount on the given side (inflow -> debit on an asset
 * bank account; outflow -> credit), whose entry is 'Posted' and dated inside
 * the window, and which have NO active match.
 */
export interface CandidatePostingQuery {
  glAccountId: string;
  side: 'debit' | 'credit';
  /**
   * Absolute value in integer cents — exact equality, no epsilon (ACC-014).
   * MUST be > 0 (caller guarantees): 0 would match the untouched side of any
   * leg (debitCents/creditCents default to 0) — the service rejects zero-value
   * lines before suggesting/matching.
   */
  amountCents: number;
  dateFrom: Date;
  dateTo: Date;
}

/** Candidate posting with the entry summary needed for ranking/display. */
export type CandidatePosting = Posting & {
  entry: { id: string; date: Date; description: string; status: string };
};

/** Per-posting reconciliation state of one journal entry (flip derivation, D5). */
export interface EntryPostingReconciliationState {
  postingId: string;
  accountId: string;
  hasActiveMatch: boolean;
}

/**
 * One ACTIVE match of a statement line, projected for the UNMATCH read (D7).
 * Carries the `matchId` the unmatch endpoint needs plus the entry summary that
 * labels WHAT is being undone (aggregation D3: a line may have N active matches).
 */
export interface ActiveMatchSummary {
  id: string;
  postingId: string;
  matchType: ReconciliationMatchType;
  entry: { id: string; date: Date; description: string };
}

/**
 * A statement line with its ACTIVE matches attached — the display read that
 * makes UNMATCH actionable (listLines). `activeMatches` is a projection
 * (as-of, ACC-021): the authoritative gate for the undo stays in the service.
 */
export type BankStatementLineWithActiveMatches = BankStatementLine & {
  activeMatches: ActiveMatchSummary[];
};
