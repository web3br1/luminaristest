import type { BankStatement, BankStatementLine, ReconciliationMatch, Prisma } from 'generated/prisma';
import type { AccountingScope } from '../scope/AccountingScope';
import type {
  BankStatementLineStatus,
  CandidatePosting,
  CandidatePostingQuery,
  CreateBankStatementInput,
  CreateBankStatementLineInput,
  CreateReconciliationMatchInput,
  EntryPostingReconciliationState,
  ReconciliationMatchType,
} from '../models/Reconciliation.model';

/**
 * Contract for bank-reconciliation data access (BE-INCR-7 / ADR-INCR7).
 * Only place with prisma.bankStatement/bankStatementLine/reconciliationMatch
 * access — plus the reconciliation-domain reads over postings/journal entries
 * (candidate query, flip-state read, status flip write) so the service never
 * touches prisma directly. PostingRepository stays untouched.
 *
 * Conventions:
 * - Every read/mutation is scoped via AccountingScope (userId + unitId).
 * - Statements are soft-deleted; statement LINES are immutable staging (no
 *   deletedAt — status covers IGNORED), so there is no generic line update.
 * - Match undo is SOFT (unmatchedAt, D7/ACC-018) — never prisma.delete().
 * - Every write accepts/uses a tx handle so the service composes match +
 *   line-status + entry-flip + audit atomically (ACC-012).
 * - Conditional writes return the affected-row count (0 = lost the race);
 *   the in-tx gate decision belongs to the service (ACC-011).
 */
export interface IReconciliationRepository {
  // ── Statements ────────────────────────────────────────────────────────────
  /** Persists a statement header (tx-aware). */
  createStatement(
    data: CreateBankStatementInput,
    tx?: Prisma.TransactionClient,
  ): Promise<BankStatement>;

  /** Finds an active statement by id within the scope, or null. */
  findStatementById(
    scope: AccountingScope,
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<BankStatement | null>;

  /** Finds an active statement by file hash (re-import dedup pre-check; the real guard is the @@unique). */
  findStatementBySha256(
    scope: AccountingScope,
    sha256: string,
    tx?: Prisma.TransactionClient,
  ): Promise<BankStatement | null>;

  /** Lists active statements, scoped, newest first, paginated ($transaction findMany+count). */
  findStatements(
    scope: AccountingScope,
    page?: number,
    limit?: number,
  ): Promise<{ statements: BankStatement[]; total: number }>;

  /**
   * Soft-deletes a statement within the scope. Throws NotFoundError if no active
   * row. Deleting a statement with ACTIVE matches must be blocked at the service
   * level (use countActiveMatchesByStatement) — the soft-delete itself does not
   * cascade nor unmatch. The row's sha256 is rewritten to `deleted:<id>` so the
   * @@unique frees the hash and the same file can be re-imported (D1 idempotency
   * is an ACTIVE-statement property; the original hash lives in the audit trail).
   */
  softDeleteStatement(
    scope: AccountingScope,
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void>;

  /** Counts ACTIVE matches across all lines of a statement (delete guard input). */
  countActiveMatchesByStatement(
    scope: AccountingScope,
    statementId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<number>;

  // ── Lines ─────────────────────────────────────────────────────────────────
  /** Bulk-inserts parsed lines (tx-aware). Returns the inserted count. */
  createLines(
    lines: CreateBankStatementLineInput[],
    tx?: Prisma.TransactionClient,
  ): Promise<number>;

  /** Finds a line by id within the scope, or null. */
  findLineById(
    scope: AccountingScope,
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<BankStatementLine | null>;

  /**
   * Lists the lines of a statement (optionally by status), ordered by
   * lineNumber asc. Unpaginated — a statement is one bounded file.
   */
  findLinesByStatement(
    scope: AccountingScope,
    statementId: string,
    status?: BankStatementLineStatus,
    tx?: Prisma.TransactionClient,
  ): Promise<BankStatementLine[]>;

  /**
   * Conditionally moves a line fromStatus -> toStatus (the only sanctioned
   * line mutation). Returns the affected-row count — 0 means the line is not
   * this tenant's or its status changed concurrently (service decides).
   */
  updateLineStatus(
    scope: AccountingScope,
    lineId: string,
    fromStatus: BankStatementLineStatus,
    toStatus: BankStatementLineStatus,
    tx: Prisma.TransactionClient,
  ): Promise<number>;

  // ── Matches ───────────────────────────────────────────────────────────────
  /** Persists a new line<->posting link (tx required — always part of the match tx). */
  createMatch(
    data: CreateReconciliationMatchInput,
    tx: Prisma.TransactionClient,
  ): Promise<ReconciliationMatch>;

  /** Finds a match by id within the scope, or null (active or undone). */
  findMatchById(
    scope: AccountingScope,
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<ReconciliationMatch | null>;

  /** Finds the (unique) match row for a line+posting pair, active or undone — reactivation path. */
  findMatchByLineAndPosting(
    scope: AccountingScope,
    statementLineId: string,
    postingId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<ReconciliationMatch | null>;

  /** Finds the ACTIVE match of a posting, or null (in-tx gate #3 — max 1 active per posting, D3). */
  findActiveMatchByPosting(
    scope: AccountingScope,
    postingId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<ReconciliationMatch | null>;

  /** Lists ACTIVE matches of a statement line. */
  findActiveMatchesByLine(
    scope: AccountingScope,
    statementLineId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<ReconciliationMatch[]>;

  /**
   * Reactivates an undone match (unmatchedAt != null -> null), refreshing
   * matchType/matchedById. Returns affected-row count (0 = not undone / not found).
   * Needed because @@unique([statementLineId, postingId]) forbids a second row.
   */
  reactivateMatch(
    scope: AccountingScope,
    id: string,
    data: { matchType: ReconciliationMatchType; matchedById?: string | null },
    tx: Prisma.TransactionClient,
  ): Promise<number>;

  /**
   * Soft-undo of an ACTIVE match (sets unmatchedAt/unmatchedById — the row is
   * never deleted, D7/ACC-018). Returns affected-row count (0 = already undone).
   */
  softUnmatch(
    scope: AccountingScope,
    id: string,
    unmatchedById: string | null,
    tx: Prisma.TransactionClient,
  ): Promise<number>;

  // ── Reconciliation-domain reads/writes over postings & entries ───────────
  /**
   * Match candidates (D6): postings on the bank GL account with the exact cent
   * amount on the given side, entry 'Posted' inside the date window, and no
   * active match. Deterministic order: entry.date asc, then id asc.
   */
  findCandidatePostings(
    scope: AccountingScope,
    query: CandidatePostingQuery,
    tx?: Prisma.TransactionClient,
  ): Promise<CandidatePosting[]>;

  /**
   * Per-posting active-match state of one entry (flip derivation input, D5).
   * The service filters to bank accounts and decides the flip.
   */
  findEntryPostingsReconciliationState(
    scope: AccountingScope,
    entryId: string,
    tx: Prisma.TransactionClient,
  ): Promise<EntryPostingReconciliationState[]>;

  /**
   * Scoped posting read with the entry summary — the unmatch path (D7) resolves
   * match.postingId -> entryId for the flip-back recompute (a Reconciled entry is
   * unreachable via findCandidatePostings, which filters status 'Posted').
   */
  findPostingById(
    scope: AccountingScope,
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<CandidatePosting | null>;

  /** Distinct GL account ids that have an active statement in this scope ("bank accounts"). */
  findScopeBankAccountIds(
    scope: AccountingScope,
    tx?: Prisma.TransactionClient,
  ): Promise<string[]>;

  /**
   * Conditionally flips a journal entry status (fromStatus -> toStatus).
   * Returns affected-row count — 0 means the entry lost the race (TOCTOU
   * guard, ACC-011). The ONLY ledger write this module performs (D5) — the
   * union type structurally forbids any flip outside Posted<->Reconciled.
   */
  updateEntryStatus(
    scope: AccountingScope,
    entryId: string,
    fromStatus: 'Posted' | 'Reconciled',
    toStatus: 'Posted' | 'Reconciled',
    tx: Prisma.TransactionClient,
  ): Promise<number>;

  /**
   * Pending-report read (§4.5): UNMATCHED lines across all ACTIVE statements of
   * a bank GL account, optionally windowed by line date, ordered by date asc.
   */
  findUnmatchedLinesByAccount(
    scope: AccountingScope,
    glAccountId: string,
    options?: { from?: Date; to?: Date },
    tx?: Prisma.TransactionClient,
  ): Promise<BankStatementLine[]>;

  /**
   * Pending-report read (§4.5): postings on the bank GL account with no active
   * match, entry status in ledger statuses, optionally windowed by entry date.
   */
  findUnmatchedBankPostings(
    scope: AccountingScope,
    glAccountId: string,
    options?: { from?: Date; to?: Date },
    tx?: Prisma.TransactionClient,
  ): Promise<CandidatePosting[]>;

  /** Runs fn inside a DB transaction (the only tx entry point for the service). */
  runTransaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T>;
}
