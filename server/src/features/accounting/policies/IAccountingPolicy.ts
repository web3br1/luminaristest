import type { UserContext } from '../../../types/UserContext';

/**
 * Authorization contract for the accounting posting engine. Gates the three
 * sensitive operations: managing the chart, posting/reversing entries, and reading
 * the ledger. Ownership is by userId (the security boundary); unitId is a user-owned
 * sub-partition, never validated cross-tenant (Contract §2).
 */
export interface IAccountingPolicy {
  /** Can manage the chart of accounts (create/soft-delete accounts). */
  canManage(userContext: UserContext): boolean;

  /** Can post or reverse journal entries. */
  canPost(userContext: UserContext): boolean;

  /** Can read the ledger / trial balance. */
  canRead(userContext: UserContext): boolean;
}
