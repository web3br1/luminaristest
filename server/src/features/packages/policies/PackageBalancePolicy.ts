import type { AccountingScope } from '../../accounting/scope/AccountingScope';
import type { IPackageBalancePolicy } from './IPackageBalancePolicy';

/**
 * Implementation of the package-balance policy. Any authenticated user operates within
 * their OWN userId silo — a wrong unitId only creates a separate sub-partition under
 * that same userId, never a cross-tenant leak (Contract §2), so unitId is not gated.
 */
export class PackageBalancePolicy implements IPackageBalancePolicy {
  canMutate(scope: AccountingScope): boolean {
    return !!scope.actorUserId;
  }

  canRead(scope: AccountingScope): boolean {
    return !!scope.actorUserId;
  }
}
