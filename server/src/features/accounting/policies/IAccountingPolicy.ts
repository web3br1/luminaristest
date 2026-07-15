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

  /** Can read the referential chart mapping + coverage diagnostic (BE-INCR-9). */
  canReadReferential(scope: AccountingScope): boolean;

  /** Can set/unset referential mappings (BE-INCR-9). */
  canManageReferential(scope: AccountingScope): boolean;

  /** Can create/pay/cancel Contas a Pagar (INCR-AP). */
  canManagePayable(scope: AccountingScope): boolean;

  /** Can list/read Contas a Pagar (INCR-AP). */
  canReadPayable(scope: AccountingScope): boolean;

  /** Can create/receive/cancel Contas a Receber (INCR-AR). */
  canManageReceivable(scope: AccountingScope): boolean;

  /** Can list/read Contas a Receber (INCR-AR). */
  canReadReceivable(scope: AccountingScope): boolean;

  /**
   * Can author/submit/reject draft journal entries in the approval tower (maker actions,
   * ADR-INCR-APPROVAL). The dynamic SoD gate (approver ≠ creator) is enforced in the service,
   * not here — this is the coarse "is an authenticated actor" check until RBAC lands (F6, ⚫).
   */
  canManageEntryApproval(scope: AccountingScope): boolean;

  /** Can approve a submitted journal entry (checker action, ADR-INCR-APPROVAL). */
  canApproveEntry(scope: AccountingScope): boolean;

  /**
   * Whether dynamic segregation of duties (approver ≠ creator/submitter) is ENFORCED for this
   * scope (ADR-INCR-APPROVAL F3, re-ratified fork-a-fork 2026-07-14). Today it is OFF while
   * `ownerUserId === actorUserId` (single-user reality): a lone operator gets a usable
   * Draft→submit→approve STAGING flow instead of a maker-checker that would block them from ever
   * approving their own draft. It hardens to real SoD automatically the moment membership makes a
   * delegate act on the owner's books (`ownerUserId !== actorUserId`). The staging machine stays
   * built; only this gate flips.
   */
  enforcesSegregationOfDuties(scope: AccountingScope): boolean;
}
