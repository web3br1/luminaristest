import type { Account, Prisma } from 'generated/prisma';
import type { AccountingScope } from '../scope/AccountingScope';

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
 * Every read is scoped by AccountingScope (ownerUserId + unitId) + deletedAt: null.
 * Repositories accept an optional tx so the service can compose atomic writes.
 */
export interface IAccountRepository {
  /** Persists a new account node. */
  create(data: CreateAccountInput, tx?: Prisma.TransactionClient): Promise<Account>;

  /** Finds an active account by its code within the scope, or null. */
  findByCode(
    scope: AccountingScope,
    code: string,
    tx?: Prisma.TransactionClient,
  ): Promise<Account | null>;

  /**
   * Restores a SOFT-DELETED account by its code within the scope. Returns null if no
   * soft-deleted row with that code exists. Exists so the chart seeder can revive a
   * canonical account that survives only as a soft-deleted row (P2002 from @@unique is
   * NOT benign in that case — findByCode would leave the leaf permanently missing).
   */
  restoreByCode(
    scope: AccountingScope,
    code: string,
    tx?: Prisma.TransactionClient,
  ): Promise<Account | null>;

  /**
   * Finds an active account by its id within the scope (ownerUserId + unitId). Used by
   * deleteAccount — the unit scoping closes the cross-unit-by-id deletion gap.
   */
  findById(scope: AccountingScope, id: string): Promise<Account | null>;

  /** Lists all active accounts for the scope, ordered by code. */
  findManyByUnit(scope: AccountingScope): Promise<Account[]>;

  /** Soft-deletes an account (sets deletedAt). */
  softDelete(scope: AccountingScope, id: string, tx?: Prisma.TransactionClient): Promise<Account>;
}
