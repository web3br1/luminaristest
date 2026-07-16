/**
 * RBAC domain constants (LGPD Fatia A / ADR-LGPD F1→a). The Prisma row types (`AccessRole`,
 * `AccessRolePermission`, `AccessRoleAssignment`) come from `generated/prisma`; this file owns the
 * enum-like unions, the PERMISSION catalog, and the audit event keys.
 *
 * A role is a per-scope, runtime-authored named set of permission keys; an assignment grants a role
 * to a subject user. This is NOT the coarse User `Role` enum (USER/ADMIN) — it is fine-grained,
 * scoped, and plugs INTO the existing AccountingPolicy / EntryApprovalService seam (§3 do ADR), not a
 * parallel gate.
 *
 * ENFORCEMENT CEILING (named, honest — ADR §6.2/§6.4): today `resolveAccountingScope` always yields
 * `ownerUserId === actorUserId` (single-user). Both the SoD gate (ADR-INCR-APPROVAL F3) and this RBAC
 * gate are therefore DORMANT in production until membership makes a delegate act on the owner's books
 * (`ownerUserId !== actorUserId`). Fatia A builds the machine and wires ONE reference enforcement
 * (the approval tower, `accounting.entry.approve`); the remaining catalog keys are the declared
 * vocabulary, enforced incrementally as each seam adopts `assertPermission` — they are validated and
 * assignable now, not silently ignored (a garbage key is rejected at the DTO/service boundary).
 */
import { ValidationError } from '../../../lib/errors';

/** Lifecycle for a role. ARCHIVED is a soft-remove (status + deletedAt); assignments keep their trail. */
export const ACCESS_ROLE_STATUSES = ['ACTIVE', 'ARCHIVED'] as const;
export type AccessRoleStatus = (typeof ACCESS_ROLE_STATUSES)[number];

/**
 * Permission catalog — the closed vocabulary of accounting actions RBAC governs. A grant referencing
 * a key outside this list REJECTS (closed set; never a silent accept — param-aceito-e-ignorado-e-bug).
 * `accounting.entry.approve` is the one enforced in Fatia A (approval tower); the rest are the
 * declared vocabulary wired as each seam adopts the gate.
 */
export const PERMISSION_KEYS = [
  'accounting.rbac.manage', // manage roles/assignments (today: owner-only via policy; delegated mgmt is future)
  'accounting.entry.approve', // approve a submitted journal entry (ENFORCED — reference integration)
  'accounting.entry.post', // post/reverse journal entries directly
  'accounting.payable.manage', // create/pay/cancel Contas a Pagar
  'accounting.receivable.manage', // create/receive/cancel Contas a Receber
  'accounting.dimension.manage', // manage the dimension catalog
  'accounting.report.read', // read ledger/reports (mask target for Fatia B)
] as const;
export type PermissionKey = (typeof PERMISSION_KEYS)[number];

const PERMISSION_KEY_SET: ReadonlySet<string> = new Set(PERMISSION_KEYS);

/** True iff `key` is a known catalog permission. */
export function isPermissionKey(key: string): key is PermissionKey {
  return PERMISSION_KEY_SET.has(key);
}

/** Validate a list of permission keys against the catalog, or REJECT with the offending key. */
export function assertPermissionKeys(keys: readonly string[]): void {
  for (const key of keys) {
    if (!isPermissionKey(key)) {
      throw new ValidationError(
        `Permissão '${key}' não existe no catálogo (use uma de: ${PERMISSION_KEYS.join(', ')}).`,
      );
    }
  }
}

/**
 * Audit event keys for RBAC management (T8 — every state change auditable). Ids/codes/permission keys
 * only; NEVER a user's name/email (PII-safe — the subject is an id).
 */
export const ACCESS_ROLE_CREATED = 'access.role_created';
export const ACCESS_ROLE_ARCHIVED = 'access.role_archived';
export const ACCESS_ROLE_PERMISSIONS_SET = 'access.role_permissions_set';
export const ACCESS_ROLE_ASSIGNED = 'access.role_assigned';
export const ACCESS_ASSIGNMENT_REVOKED = 'access.assignment_revoked';
