import type { AccessRole, AccessRolePermission, AccessRoleAssignment, Prisma } from 'generated/prisma';
import type { AccountingScope } from '../scope/AccountingScope';

/** Data to create a role. */
export interface CreateAccessRoleData {
  userId: string;
  unitId: string;
  code: string;
  name: string;
  status: string;
  createdById: string | null;
}

/** Data to create an assignment (subject holds a role). */
export interface CreateAssignmentData {
  userId: string;
  unitId: string;
  subjectUserId: string;
  roleId: string;
  createdById: string | null;
}

/** A role with its granted permission keys (flattened). */
export interface AccessRoleWithPermissions {
  role: AccessRole;
  permissions: string[];
}

/**
 * Repository contract for RBAC (LGPD Fatia A). Only place with `prisma.accessRole.*` /
 * `prisma.accessRolePermission.*` / `prisma.accessRoleAssignment.*` access. Tenancy is two-level via
 * AccountingScope (ownerUserId + unitId). Roles/assignments soft-remove (status/deletedAt); reads
 * default to active unless includeArchived. Tx-aware (every write accepts an optional tx so the write
 * + its audit commit atomically — T6/T8).
 */
export interface IAccessControlRepository {
  // Roles
  createRole(data: CreateAccessRoleData, tx?: Prisma.TransactionClient): Promise<AccessRole>;
  findRoleById(scope: AccountingScope, id: string, tx?: Prisma.TransactionClient): Promise<AccessRole | null>;
  /** Find a role by its business code REGARDLESS of soft-delete (to detect an archived same-code row). */
  findRoleByCode(scope: AccountingScope, code: string, tx?: Prisma.TransactionClient): Promise<AccessRole | null>;
  findManyRoles(scope: AccountingScope, params: { includeArchived: boolean }, tx?: Prisma.TransactionClient): Promise<AccessRole[]>;
  updateRole(scope: AccountingScope, id: string, data: Prisma.AccessRoleUpdateInput, tx?: Prisma.TransactionClient): Promise<AccessRole>;

  // Permissions (role→key)
  findPermissionsByRoleIds(roleIds: string[], tx?: Prisma.TransactionClient): Promise<AccessRolePermission[]>;
  replaceRolePermissions(roleId: string, permissionKeys: string[], tx: Prisma.TransactionClient): Promise<void>;

  // Assignments
  createAssignment(data: CreateAssignmentData, tx?: Prisma.TransactionClient): Promise<AccessRoleAssignment>;
  findAssignmentById(scope: AccountingScope, id: string, tx?: Prisma.TransactionClient): Promise<AccessRoleAssignment | null>;
  /** Find a (subject,role) grant REGARDLESS of soft-delete (to revive a revoked grant on re-assign). */
  findAssignmentBySubjectAndRole(scope: AccountingScope, subjectUserId: string, roleId: string, tx?: Prisma.TransactionClient): Promise<AccessRoleAssignment | null>;
  findManyAssignments(scope: AccountingScope, params: { subjectUserId?: string }, tx?: Prisma.TransactionClient): Promise<AccessRoleAssignment[]>;
  updateAssignment(scope: AccountingScope, id: string, data: Prisma.AccessRoleAssignmentUpdateInput, tx?: Prisma.TransactionClient): Promise<AccessRoleAssignment>;

  /** Resolve the ACTIVE permission keys an actor holds in a scope (assignment→role→permission). */
  findPermissionsForActor(scope: AccountingScope, subjectUserId: string, tx?: Prisma.TransactionClient): Promise<string[]>;

  runTransaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T>;
}
