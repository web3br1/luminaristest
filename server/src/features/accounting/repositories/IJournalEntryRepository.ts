import type { Account, JournalEntry, Posting, Prisma } from 'generated/prisma';
import type { AccountingScope } from '../scope/AccountingScope';

/** Input for creating a JournalEntry header. */
export interface CreateJournalEntryInput {
  userId: string;
  unitId: string;
  date: Date;
  description: string;
  status: string;
  sourceType: string;
  sourceId?: string | null;
  createdById?: string | null;
  postedById?: string | null;
  // Nullable since ADR-INCR-APPROVAL: a Draft/PendingApproval entry has NO number — it is
  // born at POST/approve inside the tx (ACC-015). postEntry still passes both non-null.
  fiscalYear: number | null;
  entryNumber: number | null;
}

/**
 * Fields settable by the optimistic-lock CAS (ADR-INCR-APPROVAL, ACC-023). `version` is the
 * NEW value to write; the WHERE clause matches the expected (prior) version so a concurrent
 * writer that already bumped it makes this update affect 0 rows.
 */
export interface JournalEntryCasData {
  status?: string;
  submittedById?: string | null;
  approvedById?: string | null;
  postedById?: string | null;
  contentHash?: string | null;
  fiscalYear?: number | null;
  entryNumber?: number | null;
  date?: Date;
  description?: string;
  version: number;
}

/** A JournalEntry with its postings eagerly loaded. */
export type JournalEntryWithPostings = JournalEntry & { postings: Posting[] };

/** A Posting with its account code and name (for list-entries response). */
export type PostingWithAccount = Posting & { account: Pick<Account, 'code' | 'name'> };

/** A JournalEntry with postings that include account info. */
export type JournalEntryWithFullPostings = JournalEntry & { postings: PostingWithAccount[] };

/**
 * Contract for journal-entry (lançamento) data access. First-class Prisma.
 * Scoped via AccountingScope. Posted/Reversed entries are immutable except for the
 * status transition to 'Reversed' and the reversedById link (set via setStatus / setReversedBy).
 *
 * Hard-delete is intentionally absent (ADR-INCR3 Q10): once a JournalEntry has a
 * fiscalYear/entryNumber assigned, deleting it would create a gap in the Livro Diário
 * sequence. Corrections happen exclusively via reversal (estorno).
 */
export interface IJournalEntryRepository {
  /** Persists a new entry header. */
  create(data: CreateJournalEntryInput, tx?: Prisma.TransactionClient): Promise<JournalEntry>;

  /** Finds an entry by id within the scope, with its postings, or null. */
  findById(
    scope: AccountingScope,
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<JournalEntryWithPostings | null>;

  /** Finds an entry by its (sourceType, sourceId) idempotency key within the scope. */
  findBySource(
    scope: AccountingScope,
    sourceType: string,
    sourceId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<JournalEntryWithPostings | null>;

  /** Transitions an entry's status (e.g. Posted -> Reversed). Throws if not found in scope. */
  setStatus(
    scope: AccountingScope,
    id: string,
    status: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void>;

  /**
   * Optimistic-lock CAS update (ADR-INCR-APPROVAL, ACC-023). Updates the entry ONLY when its
   * current `version` equals `expectedVersion` (and it belongs to the scope). Returns the number
   * of rows affected: 1 = applied, 0 = version conflict / not found (the caller raises a 409).
   * The whole approval state machine (submit/approve/reject/updateDraft) mutates through here so
   * two concurrent transitions can never both win.
   */
  casUpdate(
    scope: AccountingScope,
    id: string,
    expectedVersion: number,
    data: JournalEntryCasData,
    tx?: Prisma.TransactionClient,
  ): Promise<number>;

  /**
   * Lists entries for the scope whose status is in `statuses` (e.g. the PendingApproval queue),
   * paginated, with postings + account code/name. Ordered by date descending. Read-only.
   */
  findManyByStatus(
    scope: AccountingScope,
    statuses: string[],
    skip: number,
    take: number,
  ): Promise<{ entries: JournalEntryWithFullPostings[]; total: number }>;

  /** Links an original entry to its reversal (sets reversedById). Tenant-scoped. */
  setReversedBy(
    scope: AccountingScope,
    id: string,
    reversedById: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void>;

  /**
   * Rewrites an entry's `sourceId` (idempotency key). Used ONLY to FREE the key of a
   * reversed closing entry so the exercise can be closed again (BE-INCR-SPED-APURACAO
   * D5, memory `unique-de-idempotencia-x-soft-delete`). Tenant-scoped; throws if not found.
   */
  setSourceId(
    scope: AccountingScope,
    id: string,
    sourceId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void>;

  /**
   * Lists entries for the scope paginated, with postings including account code+name.
   * Ordered by date descending.
   */
  findManyByUnit(
    scope: AccountingScope,
    skip: number,
    take: number,
  ): Promise<{ entries: JournalEntryWithFullPostings[]; total: number }>;

  /**
   * Lists ALL entries (no pagination) in a date window whose status is in `statuses`,
   * with postings + account code/name, ordered deterministically by (date, entryNumber)
   * ASC. Backs the SPED ECD Diário (I200/I250, ADR-INCR-SPED-ECD D9): the read
   * "entries+legs by window, LEDGER_STATUSES" that no by-account report exposed.
   * Read-only.
   */
  findManyForExport(
    scope: AccountingScope,
    statuses: string[],
    window: { from: Date; to: Date },
  ): Promise<JournalEntryWithFullPostings[]>;
}
