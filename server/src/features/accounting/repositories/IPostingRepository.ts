import type { Posting, Prisma } from 'generated/prisma';

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

  /** Lists all legs of a given entry, scoped to (userId, unitId). */
  findByEntryId(
    userId: string,
    unitId: string,
    entryId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<Posting[]>;

  /** Lists one account's legs scoped to (userId, unitId), ordered by createdAt. */
  findByAccount(userId: string, unitId: string, accountId: string): Promise<Posting[]>;

  /**
   * Sums debit/credit per account across all postings whose parent entry has one of
   * the given statuses, scoped to (userId, unitId). Backs the trial balance.
   */
  groupByAccount(
    userId: string,
    unitId: string,
    statuses: string[],
  ): Promise<AccountPostingTotals[]>;
}
