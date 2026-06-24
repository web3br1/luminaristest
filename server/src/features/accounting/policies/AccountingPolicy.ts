import type { AccountingScope } from '../scope/AccountingScope';
import type { IAccountingPolicy } from './IAccountingPolicy';

/**
 * Implementation of the accounting policy. Any authenticated user operates within their
 * OWN userId silo — a wrong unitId only creates a separate sub-partition under that same
 * userId, never a cross-tenant leak (Contract §2), so unitId is not gated here.
 */
export class AccountingPolicy implements IAccountingPolicy {
  canManage(scope: AccountingScope): boolean {
    return !!scope.actorUserId;
  }

  canPost(scope: AccountingScope): boolean {
    return !!scope.actorUserId;
  }

  canRead(scope: AccountingScope): boolean {
    return !!scope.actorUserId;
  }
}
