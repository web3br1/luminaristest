import type { AccountingScope } from '../../accounting/scope/AccountingScope';

/**
 * Authorization contract for the prepaid-package balance. The actor is identified by
 * scope.actorUserId (the security boundary); unitId is a user-owned sub-partition,
 * never validated cross-tenant (Contract §2) — same stance as the accounting policy.
 */
export interface IPackageBalancePolicy {
  /** Can credit/debit a customer's package balance (origin + consumption). */
  canMutate(scope: AccountingScope): boolean;

  /** Can read balances. */
  canRead(scope: AccountingScope): boolean;
}
