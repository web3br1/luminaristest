import prisma from '../../../lib/prisma';
import type { AccessRole, AccessRolePermission, AccessRoleAssignment, Prisma } from 'generated/prisma';
import type { AccountingScope } from '../scope/AccountingScope';
import { accountingScopeWhere } from '../scope/AccountingScope';
import type {
  CreateAccessRoleData,
  CreateAssignmentData,
  IAccessControlRepository,
} from './IAccessControlRepository';

/**
 * Prisma-backed repository for RBAC (LGPD Fatia A). Only place with `prisma.accessRole.*` /
 * `prisma.accessRolePermission.*` / `prisma.accessRoleAssignment.*` access. Tenancy is two-level via
 * AccountingScope. Soft-remove: reads default to `deletedAt: null` unless includeArchived.
 */
export class AccessControlRepository implements IAccessControlRepository {
  // ── Roles ────────────────────────────────────────────────────────────────
  public async createRole(data: CreateAccessRoleData, tx?: Prisma.TransactionClient): Promise<AccessRole> {
    return (tx ?? prisma).accessRole.create({ data });
  }

  public async findRoleById(
    scope: AccountingScope,
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<AccessRole | null> {
    return (tx ?? prisma).accessRole.findFirst({ where: { id, ...accountingScopeWhere(scope) } });
  }

  public async findRoleByCode(
    scope: AccountingScope,
    code: string,
    tx?: Prisma.TransactionClient,
  ): Promise<AccessRole | null> {
    // No deletedAt filter: at most one row per (userId, unitId, code) via @@unique, archived or not.
    return (tx ?? prisma).accessRole.findFirst({ where: { ...accountingScopeWhere(scope), code } });
  }

  public async findManyRoles(
    scope: AccountingScope,
    params: { includeArchived: boolean },
    tx?: Prisma.TransactionClient,
  ): Promise<AccessRole[]> {
    return (tx ?? prisma).accessRole.findMany({
      where: { ...accountingScopeWhere(scope), ...(params.includeArchived ? {} : { deletedAt: null }) },
      orderBy: [{ code: 'asc' }],
    });
  }

  public async updateRole(
    scope: AccountingScope,
    id: string,
    data: Prisma.AccessRoleUpdateInput,
    tx?: Prisma.TransactionClient,
  ): Promise<AccessRole> {
    const { userId, unitId } = accountingScopeWhere(scope);
    return (tx ?? prisma).accessRole.update({ where: { id, userId, unitId }, data });
  }

  // ── Permissions (role→key) ─────────────────────────────────────────────────
  public async findPermissionsByRoleIds(
    roleIds: string[],
    tx?: Prisma.TransactionClient,
  ): Promise<AccessRolePermission[]> {
    if (roleIds.length === 0) return [];
    return (tx ?? prisma).accessRolePermission.findMany({ where: { roleId: { in: roleIds } } });
  }

  /** Replace a role's permission set wholesale (delete-all + recreate) — MUST run inside a tx. */
  public async replaceRolePermissions(
    roleId: string,
    permissionKeys: string[],
    tx: Prisma.TransactionClient,
  ): Promise<void> {
    await tx.accessRolePermission.deleteMany({ where: { roleId } });
    if (permissionKeys.length > 0) {
      await tx.accessRolePermission.createMany({
        data: permissionKeys.map((permissionKey) => ({ roleId, permissionKey })),
      });
    }
  }

  // ── Assignments ────────────────────────────────────────────────────────────
  public async createAssignment(
    data: CreateAssignmentData,
    tx?: Prisma.TransactionClient,
  ): Promise<AccessRoleAssignment> {
    return (tx ?? prisma).accessRoleAssignment.create({ data });
  }

  public async findAssignmentById(
    scope: AccountingScope,
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<AccessRoleAssignment | null> {
    return (tx ?? prisma).accessRoleAssignment.findFirst({ where: { id, ...accountingScopeWhere(scope) } });
  }

  public async findAssignmentBySubjectAndRole(
    scope: AccountingScope,
    subjectUserId: string,
    roleId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<AccessRoleAssignment | null> {
    // No deletedAt filter: at most one row per (userId, unitId, subjectUserId, roleId) via @@unique.
    return (tx ?? prisma).accessRoleAssignment.findFirst({
      where: { ...accountingScopeWhere(scope), subjectUserId, roleId },
    });
  }

  public async findManyAssignments(
    scope: AccountingScope,
    params: { subjectUserId?: string },
    tx?: Prisma.TransactionClient,
  ): Promise<AccessRoleAssignment[]> {
    return (tx ?? prisma).accessRoleAssignment.findMany({
      where: {
        ...accountingScopeWhere(scope),
        ...(params.subjectUserId ? { subjectUserId: params.subjectUserId } : {}),
        deletedAt: null,
      },
      orderBy: [{ createdAt: 'asc' }],
    });
  }

  public async updateAssignment(
    scope: AccountingScope,
    id: string,
    data: Prisma.AccessRoleAssignmentUpdateInput,
    tx?: Prisma.TransactionClient,
  ): Promise<AccessRoleAssignment> {
    const { userId, unitId } = accountingScopeWhere(scope);
    return (tx ?? prisma).accessRoleAssignment.update({ where: { id, userId, unitId }, data });
  }

  /**
   * Resolve the ACTIVE permission keys an actor holds in a scope. Walks assignment (live) → role
   * (ACTIVE) → permission. Archived roles / revoked assignments contribute nothing.
   */
  public async findPermissionsForActor(
    scope: AccountingScope,
    subjectUserId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<string[]> {
    const client = tx ?? prisma;
    const assignments = await client.accessRoleAssignment.findMany({
      where: { ...accountingScopeWhere(scope), subjectUserId, deletedAt: null },
      select: { roleId: true },
    });
    if (assignments.length === 0) return [];
    const roleIds = assignments.map((a) => a.roleId);
    const activeRoles = await client.accessRole.findMany({
      where: { id: { in: roleIds }, ...accountingScopeWhere(scope), status: 'ACTIVE', deletedAt: null },
      select: { id: true },
    });
    if (activeRoles.length === 0) return [];
    const perms = await client.accessRolePermission.findMany({
      where: { roleId: { in: activeRoles.map((r) => r.id) } },
      select: { permissionKey: true },
    });
    return [...new Set(perms.map((p) => p.permissionKey))];
  }

  public async runTransaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return prisma.$transaction(fn);
  }
}
