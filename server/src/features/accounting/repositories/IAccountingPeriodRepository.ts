import type { AccountingPeriod, AccountingPeriodStatus, Prisma } from 'generated/prisma';
import type { AccountingScope } from '../scope/AccountingScope';

export type { AccountingPeriod };

export interface IAccountingPeriodRepository {
  /** Find a period by (userId, unitId, year, month). Returns null if not seeded. */
  findByYearMonth(
    scope: AccountingScope,
    year: number,
    month: number,
    tx?: Prisma.TransactionClient,
  ): Promise<AccountingPeriod | null>;

  /** Find a period by its id. Returns null if not found. */
  findById(
    scope: AccountingScope,
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<AccountingPeriod | null>;

  /**
   * Seed 12 FUTURE periods for a fiscal year. Idempotent (skipDuplicates).
   * Returns all 12 periods (existing + newly created).
   */
  seedYear(
    scope: AccountingScope,
    year: number,
    tx?: Prisma.TransactionClient,
  ): Promise<AccountingPeriod[]>;

  /**
   * Transition a period to a new status AND write an AccountingPeriodTransition row
   * in the SAME transaction. tx is mandatory — caller owns the transaction.
   */
  setStatus(
    scope: AccountingScope,
    year: number,
    month: number,
    nextStatus: AccountingPeriodStatus,
    actorUserId: string,
    reason: string | undefined,
    tx: Prisma.TransactionClient,
    fromStatus?: AccountingPeriodStatus | null,
  ): Promise<AccountingPeriod>;

  /** List all periods for a fiscal year ordered by month asc. */
  list(scope: AccountingScope, year: number): Promise<AccountingPeriod[]>;
}
