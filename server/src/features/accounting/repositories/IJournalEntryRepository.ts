import type { Account, JournalEntry, Posting, Prisma } from 'generated/prisma';

/** Input for creating a JournalEntry header. */
export interface CreateJournalEntryInput {
  userId: string;
  unitId: string;
  date: Date;
  description: string;
  status: string;
  sourceType: string;
  sourceId?: string | null;
}

/** A JournalEntry with its postings eagerly loaded. */
export type JournalEntryWithPostings = JournalEntry & { postings: Posting[] };

/** A Posting with its account code and name (for list-entries response). */
export type PostingWithAccount = Posting & { account: Pick<Account, 'code' | 'name'> };

/** A JournalEntry with postings that include account info. */
export type JournalEntryWithFullPostings = JournalEntry & { postings: PostingWithAccount[] };

/**
 * Contract for journal-entry (lançamento) data access. First-class Prisma.
 * Scoped userId + unitId. Posted/Reversed entries are immutable except for the
 * status transition to 'Reversed' and the reversedById link (set via setStatus / setReversedBy).
 */
export interface IJournalEntryRepository {
  /** Persists a new entry header. */
  create(data: CreateJournalEntryInput, tx?: Prisma.TransactionClient): Promise<JournalEntry>;

  /** Finds an entry by id within (userId, unitId), with its postings, or null. */
  findById(
    userId: string,
    unitId: string,
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<JournalEntryWithPostings | null>;

  /** Finds an entry by its (sourceType, sourceId) idempotency key within (userId, unitId). */
  findBySource(
    userId: string,
    unitId: string,
    sourceType: string,
    sourceId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<JournalEntryWithPostings | null>;

  /** Transitions an entry's status (e.g. Posted -> Reversed). Tenant-scoped: throws if the
   * (userId, unitId, id) row does not exist. */
  setStatus(
    userId: string,
    unitId: string,
    id: string,
    status: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void>;

  /** Links an original entry to its reversal (sets reversedById). Tenant-scoped. */
  setReversedBy(
    userId: string,
    unitId: string,
    id: string,
    reversedById: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void>;

  /**
   * Lists entries for a (userId, unitId) paginated, with postings including account code+name.
   * Ordered by date descending.
   */
  findManyByUnit(
    userId: string,
    unitId: string,
    skip: number,
    take: number,
  ): Promise<{ entries: JournalEntryWithFullPostings[]; total: number }>;
}
