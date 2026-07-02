import type { Posting, Prisma } from 'generated/prisma';
import type { AccountingScope } from '../scope/AccountingScope';

/** Input for creating a Posting (one leg of a double entry). */
export interface CreatePostingInput {
  userId: string;
  unitId: string;
  entryId: string;
  accountId: string;
  debitCents: number;
  creditCents: number;
}

/** A per-account debit/credit aggregate produced by groupByAccount. */
export interface AccountPostingTotals {
  accountId: string;
  debitCents: number;
  creditCents: number;
}

/**
 * Contract for ledger-line (partida) data access. First-class Prisma. Money is
 * INTEGER CENTS — aggregates sum Int columns, never floats.
 */
export interface IPostingRepository {
  /** Persists one ledger leg. */
  create(data: CreatePostingInput, tx?: Prisma.TransactionClient): Promise<Posting>;

  /** Lists all legs of a given entry, scoped via AccountingScope. */
  findByEntryId(
    scope: AccountingScope,
    entryId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<Posting[]>;

  /** Lists one account's legs scoped via AccountingScope, ordered by createdAt. */
  findByAccount(scope: AccountingScope, accountId: string): Promise<Posting[]>;

  /**
   * Sums debit/credit per account across all postings whose parent entry has one of
   * the given statuses, scoped via AccountingScope. Backs the trial balance.
   * Optional `from`/`to` filter on the entry date (inclusive bounds).
   * Omitting both is identical to the prior behaviour (no date clause added).
   */
  groupByAccount(
    scope: AccountingScope,
    statuses: string[],
    options?: { from?: Date; to?: Date },
  ): Promise<AccountPostingTotals[]>;

  /**
   * Atomically increments the JournalEntrySequence counter for (scope, fiscalYear)
   * and returns the new last value. Must be called inside a transaction.
   * Rollback of the outer tx also rolls back the increment — gapless transactional.
   */
  nextEntryNumber(
    scope: AccountingScope,
    fiscalYear: number,
    tx: Prisma.TransactionClient,
  ): Promise<number>;

  /**
   * Runs `fn` inside a Prisma transaction and returns its result. Services use this
   * to compose atomic cross-repo writes without importing the prisma singleton directly
   * (layer boundary: only repositories import the singleton).
   */
  runTransaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T>;
}
