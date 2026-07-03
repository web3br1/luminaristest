import type { AccountingScope } from '../scope/AccountingScope';

/**
 * Authorization contract for the accounting posting engine. Gates the three
 * sensitive operations: managing the chart, posting/reversing entries, and reading
 * the ledger. The actor is identified by scope.actorUserId (the security boundary);
 * unitId is a user-owned sub-partition, never validated cross-tenant (Contract §2).
 */
export interface IAccountingPolicy {
  /** Can manage the chart of accounts (create/soft-delete accounts). */
  canManage(scope: AccountingScope): boolean;

  /** Can post or reverse journal entries. */
  canPost(scope: AccountingScope): boolean;

  /** Can read the ledger / trial balance. */
  canRead(scope: AccountingScope): boolean;

  /** Can open, close, or reopen accounting periods. */
  canClosePeriod(scope: AccountingScope): boolean;

  /** Can import statements and match/unmatch bank reconciliation (BE-INCR-7). */
  canReconcile(scope: AccountingScope): boolean;
}
