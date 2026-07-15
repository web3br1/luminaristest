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

  // ponytail: membership check entra quando unidade for compartilhada
  canClosePeriod(scope: AccountingScope): boolean {
    return !!scope.actorUserId;
  }

  canReconcile(scope: AccountingScope): boolean {
    return !!scope.actorUserId;
  }

  canReadReferential(scope: AccountingScope): boolean {
    return !!scope.actorUserId;
  }

  canManageReferential(scope: AccountingScope): boolean {
    return !!scope.actorUserId;
  }

  canManagePayable(scope: AccountingScope): boolean {
    return !!scope.actorUserId;
  }

  canReadPayable(scope: AccountingScope): boolean {
    return !!scope.actorUserId;
  }

  // ponytail: SoD dinâmica (approver != creator) e RBAC por papel entram quando a unidade for
  // compartilhada / os papéis existirem (F3/F6, ⚫). Aqui só a checagem grosseira de ator.
  canManageEntryApproval(scope: AccountingScope): boolean {
    return !!scope.actorUserId;
  }

  canApproveEntry(scope: AccountingScope): boolean {
    return !!scope.actorUserId;
  }
}
