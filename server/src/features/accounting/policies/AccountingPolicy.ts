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

  canManageReceivable(scope: AccountingScope): boolean {
    return !!scope.actorUserId;
  }

  canReadReceivable(scope: AccountingScope): boolean {
    return !!scope.actorUserId;
  }

  // ponytail: RBAC por papel (F6, ⚫) entra quando os papéis existirem. Aqui só a checagem
  // grosseira de ator; a SoD dinâmica vive em enforcesSegregationOfDuties (abaixo).
  canManageEntryApproval(scope: AccountingScope): boolean {
    return !!scope.actorUserId;
  }

  canApproveEntry(scope: AccountingScope): boolean {
    return !!scope.actorUserId;
  }

  // SoD dinâmica (ADR-INCR-APPROVAL F3, re-ratificado fork-a-fork 2026-07-14): OFF enquanto
  // ownerUserId === actorUserId (single-user → staging usável), ativa sozinha quando um delegado
  // opera os livros do dono (ownerUserId !== actorUserId, via membership futuro). Ver
  // resolveAccountingScope: hoje owner === actor sempre, logo isto é no-op — sem teatro.
  enforcesSegregationOfDuties(scope: AccountingScope): boolean {
    return scope.ownerUserId !== scope.actorUserId;
  }
}
