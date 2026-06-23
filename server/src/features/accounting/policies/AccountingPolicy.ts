import type { UserContext } from '../../../types/UserContext';
import type { IAccountingPolicy } from './IAccountingPolicy';

/**
 * Implementation of the accounting policy. Mirrors ChatInstancePolicy: authorization
 * is by authenticated ownership (userId). Any authenticated user operates within their
 * OWN userId silo — a wrong unitId only creates a separate sub-partition under that same
 * userId, never a cross-tenant leak (Contract §2), so unitId is not gated here.
 */
export class AccountingPolicy implements IAccountingPolicy {
  /** Can manage the chart of accounts (create/soft-delete accounts). */
  canManage(userContext: UserContext): boolean {
    return !!userContext.userId;
  }

  /** Can post or reverse journal entries. */
  canPost(userContext: UserContext): boolean {
    return !!userContext.userId;
  }

  /** Can read the ledger / trial balance. */
  canRead(userContext: UserContext): boolean {
    return !!userContext.userId;
  }
}
