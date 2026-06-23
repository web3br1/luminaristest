import type { Account, Prisma } from 'generated/prisma';

/** Input for creating an Account (chart-of-accounts node). */
export interface CreateAccountInput {
  userId: string;
  unitId: string;
  code: string;
  name: string;
  nature: string;
  acceptsEntries: boolean;
}

/**
 * Contract for chart-of-accounts data access. First-class Prisma (NOT DynamicTable).
 * Every read is scoped userId + unitId + deletedAt: null (two-level tenancy, soft-delete).
 * Repositories accept an optional tx so the service can compose atomic writes.
 */
export interface IAccountRepository {
  /** Persists a new account node. */
  create(data: CreateAccountInput, tx?: Prisma.TransactionClient): Promise<Account>;

  /** Finds an active account by its code within (userId, unitId), or null. */
  findByCode(
    userId: string,
    unitId: string,
    code: string,
    tx?: Prisma.TransactionClient,
  ): Promise<Account | null>;

  /**
   * Restores a SOFT-DELETED account by its code within (userId, unitId): clears deletedAt
   * and returns the revived row. Returns null if no soft-deleted row with that code exists
   * (i.e. the code is either free or already held by an ACTIVE account). Exists so the chart
   * seeder can revive a canonical account that survives only as a soft-deleted row — the one
   * case where the @@unique([userId,unitId,code]) collision (P2002) is NOT benign, because
   * findByCode (which filters deletedAt:null) would otherwise leave the leaf permanently
   * missing and every postEntry to that code failing in resolveLeafAccount.
   */
  restoreByCode(
    userId: string,
    unitId: string,
    code: string,
    tx?: Prisma.TransactionClient,
  ): Promise<Account | null>;

  /** Lists all active accounts for a (userId, unitId), ordered by code. */
  findManyByUnit(userId: string, unitId: string): Promise<Account[]>;

  /** Soft-deletes an account (sets deletedAt). */
  softDelete(userId: string, unitId: string, id: string): Promise<Account>;
}
