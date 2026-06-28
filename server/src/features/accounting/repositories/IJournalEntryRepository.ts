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
  fiscalYear: number;
  entryNumber: number;
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

  /** Links an original entry to its reversal (sets reversedById). Tenant-scoped. */
  setReversedBy(
    scope: AccountingScope,
    id: string,
    reversedById: string,
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
}
