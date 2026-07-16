import { ForbiddenError, NotFoundError, ValidationError } from '../../../lib/errors';
import { Prisma } from 'generated/prisma';
import type { AccessRole, AccessRoleAssignment } from 'generated/prisma';
import {
  ACCESS_ASSIGNMENT_REVOKED,
  ACCESS_ROLE_ARCHIVED,
  ACCESS_ROLE_ASSIGNED,
  ACCESS_ROLE_CREATED,
  ACCESS_ROLE_PERMISSIONS_SET,
  type PermissionKey,
} from '../models/AccessControl.model';
import type {
  ArchiveAccessRoleInput,
  AssignRoleInput,
  CreateAccessRoleInput,
  ListAccessRolesQueryInput,
  ListAssignmentsQueryInput,
  RevokeAssignmentInput,
  SetRolePermissionsInput,
} from '../dtos/AccessControlDto';
import type {
  AccessRoleWithPermissions,
  IAccessControlRepository,
} from '../repositories/IAccessControlRepository';
import type { IAccountingPolicy } from '../policies/IAccountingPolicy';
import type { AuditService } from './AuditService';
import type { AccountingScope } from '../scope/AccountingScope';
import { accountingScopeWhere } from '../scope/AccountingScope';

/**
 * Narrow enforcement port other services depend on (EntryApprovalService). Kept minimal so a consumer
 * needs only "assert this permission", not the whole RBAC surface. AccessControlService implements it.
 */
export interface IAccessControlEnforcer {
  /**
   * Throw ForbiddenError unless the actor may perform `permission` in this scope. OWNER-BYPASS: when
   * `ownerUserId === actorUserId` the actor is root on their own books and is always allowed — this
   * mirrors the SoD gate (ADR-INCR-APPROVAL F3, OFF single-user) and keeps RBAC DORMANT until
   * membership yields a delegate (`ownerUserId !== actorUserId`). A delegate must hold the permission
   * via an active role assignment.
   */
  assertPermission(scope: AccountingScope, permission: PermissionKey, tx?: Prisma.TransactionClient): Promise<void>;
}

/**
 * AccessControlService — RBAC (LGPD Fatia A / ADR-LGPD F1→a). FIRST-CLASS PRISMA. Two jobs:
 *  1. Author the catalog by COMMANDS (createRole/setRolePermissions/archiveRole/assignRole/revoke),
 *     each audited in the SAME tx (T8).
 *  2. Serve `assertPermission` — the enforcement primitive the existing gates consult (the approval
 *     tower in Fatia A). This is the single gate extended, NOT a parallel one (§3 do ADR).
 *
 * Management is OWNER-ONLY in Fatia A (`policy.canManageAccessControl` = owner==actor): someone must
 * author the first role, and only the owner can — no bootstrap paradox. Delegated RBAC management
 * (via `accounting.rbac.manage`) is a named future refinement (ADR §3 D2).
 */
export class AccessControlService implements IAccessControlEnforcer {
  constructor(
    private readonly repo: IAccessControlRepository,
    private readonly auditService: AuditService,
    private readonly policy: IAccountingPolicy,
  ) {}

  // ── Enforcement primitive ──────────────────────────────────────────────────
  async assertPermission(
    scope: AccountingScope,
    permission: PermissionKey,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    if (scope.ownerUserId === scope.actorUserId) return; // owner is root on own books (mirrors SoD-off)
    const perms = await this.repo.findPermissionsForActor(scope, scope.actorUserId, tx);
    if (!perms.includes(permission)) {
      throw new ForbiddenError(`Esta ação requer a permissão '${permission}'.`);
    }
  }

  // ── Reads ──────────────────────────────────────────────────────────────────
  async listRoles(scope: AccountingScope, params: ListAccessRolesQueryInput): Promise<AccessRoleWithPermissions[]> {
    if (!this.policy.canReadAccessControl(scope)) {
      throw new ForbiddenError('Você não tem permissão para ler papéis de acesso.');
    }
    const roles = await this.repo.findManyRoles(scope, { includeArchived: params.includeArchived });
    const perms = await this.repo.findPermissionsByRoleIds(roles.map((r) => r.id));
    return roles.map((role) => ({
      role,
      permissions: perms.filter((p) => p.roleId === role.id).map((p) => p.permissionKey),
    }));
  }

  async listAssignments(scope: AccountingScope, params: ListAssignmentsQueryInput): Promise<AccessRoleAssignment[]> {
    if (!this.policy.canReadAccessControl(scope)) {
      throw new ForbiddenError('Você não tem permissão para ler atribuições de acesso.');
    }
    return this.repo.findManyAssignments(scope, { subjectUserId: params.subjectUserId });
  }

  // ── Role commands ───────────────────────────────────────────────────────────
  async createRole(scope: AccountingScope, dto: CreateAccessRoleInput): Promise<AccessRole> {
    this.assertCanManage(scope);
    const { userId, unitId } = accountingScopeWhere(scope);
    const permissions = dto.permissions ?? [];

    // Free the soft-deleted key (unique-de-idempotencia-x-soft-delete): the @@unique([userId,unitId,code])
    // covers ARCHIVED rows too, so a plain create over an archived same-code role would P2002. An ACTIVE
    // duplicate is a real conflict; an ARCHIVED one is REVIVED in place (re-create redefines name +
    // permission set). There is no separate unarchive command by design — re-create IS the unarchive.
    const existing = await this.repo.findRoleByCode(scope, dto.code);
    if (existing && !existing.deletedAt) {
      throw new ValidationError(`Já existe um papel com o código '${dto.code}' nesta unidade.`);
    }
    try {
      return await this.repo.runTransaction(async (tx) => {
        const role = existing
          ? await this.repo.updateRole(scope, existing.id, { status: 'ACTIVE', deletedAt: null, name: dto.name }, tx)
          : await this.repo.createRole(
              { userId, unitId, code: dto.code, name: dto.name, status: 'ACTIVE', createdById: scope.actorUserId },
              tx,
            );
        // Reset the permission set to exactly the requested one (empty clears — a re-created role is fresh).
        await this.repo.replaceRolePermissions(role.id, permissions, tx);
        await this.auditService.append(tx, scope, {
          actorUserId: scope.actorUserId,
          eventType: ACCESS_ROLE_CREATED,
          targetType: 'access_role',
          targetId: role.id,
          payload: { roleId: role.id, code: role.code, name: role.name, permissionCount: String(permissions.length) },
        });
        return role;
      });
    } catch (error) {
      // Backstop for a concurrent create racing the pre-check (near-impossible under single-process, T11).
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ValidationError(`Já existe um papel com o código '${dto.code}' nesta unidade.`);
      }
      throw error;
    }
  }

  async setRolePermissions(scope: AccountingScope, roleId: string, dto: SetRolePermissionsInput): Promise<AccessRole> {
    this.assertCanManage(scope);
    const role = await this.repo.findRoleById(scope, roleId);
    if (!role) throw new NotFoundError(`Papel '${roleId}' não foi encontrado.`);
    if (role.status !== 'ACTIVE') throw new ValidationError('Não é possível alterar permissões de um papel arquivado.');

    return this.repo.runTransaction(async (tx) => {
      await this.repo.replaceRolePermissions(roleId, dto.permissions, tx);
      await this.auditService.append(tx, scope, {
        actorUserId: scope.actorUserId,
        eventType: ACCESS_ROLE_PERMISSIONS_SET,
        targetType: 'access_role',
        targetId: roleId,
        payload: { roleId, permissionCount: String(dto.permissions.length) },
      });
      return role;
    });
  }

  async archiveRole(scope: AccountingScope, roleId: string, _dto: ArchiveAccessRoleInput): Promise<AccessRole> {
    this.assertCanManage(scope);
    const role = await this.repo.findRoleById(scope, roleId);
    if (!role) throw new NotFoundError(`Papel '${roleId}' não foi encontrado.`);
    if (role.status === 'ARCHIVED') return role; // idempotent

    // Archiving a role does NOT hard-revoke its assignments — findPermissionsForActor filters on role
    // status ACTIVE, so an archived role grants nothing (its assignments go inert), while the historical
    // assignment trail is preserved (D3 — the trail never disappears).
    return this.repo.runTransaction(async (tx) => {
      const archived = await this.repo.updateRole(scope, roleId, { status: 'ARCHIVED', deletedAt: new Date() }, tx);
      await this.auditService.append(tx, scope, {
        actorUserId: scope.actorUserId,
        eventType: ACCESS_ROLE_ARCHIVED,
        targetType: 'access_role',
        targetId: roleId,
        payload: { roleId, code: role.code },
      });
      return archived;
    });
  }

  // ── Assignment commands ──────────────────────────────────────────────────────
  async assignRole(scope: AccountingScope, dto: AssignRoleInput): Promise<AccessRoleAssignment> {
    this.assertCanManage(scope);
    const { userId, unitId } = accountingScopeWhere(scope);
    const role = await this.repo.findRoleById(scope, dto.roleId);
    if (!role) throw new NotFoundError(`Papel '${dto.roleId}' não foi encontrado.`);
    if (role.status !== 'ACTIVE') throw new ValidationError('Não é possível atribuir um papel arquivado.');
    // subjectUserId is a plain string (like createdById) — the member granted the role. Not validated
    // against the User table in Fatia A (a grant may precede a membership row); named limitation.

    // Free the soft-deleted key (unique-de-idempotencia-x-soft-delete): grant→revoke→re-grant is a
    // normal lifecycle, but @@unique([userId,unitId,subjectUserId,roleId]) covers the revoked row. An
    // ACTIVE grant is a real duplicate; a REVOKED one is REVIVED in place (a fresh grant event).
    const existing = await this.repo.findAssignmentBySubjectAndRole(scope, dto.subjectUserId, dto.roleId);
    if (existing && !existing.deletedAt) {
      throw new ValidationError('Este papel já está atribuído a este usuário nesta unidade.');
    }
    try {
      return await this.repo.runTransaction(async (tx) => {
        const assignment = existing
          ? await this.repo.updateAssignment(scope, existing.id, { deletedAt: null, createdById: scope.actorUserId }, tx)
          : await this.repo.createAssignment(
              { userId, unitId, subjectUserId: dto.subjectUserId, roleId: dto.roleId, createdById: scope.actorUserId },
              tx,
            );
        await this.auditService.append(tx, scope, {
          actorUserId: scope.actorUserId,
          eventType: ACCESS_ROLE_ASSIGNED,
          targetType: 'access_role_assignment',
          targetId: assignment.id,
          payload: { roleId: dto.roleId, assignmentId: assignment.id, subjectUserId: dto.subjectUserId },
        });
        return assignment;
      });
    } catch (error) {
      // Backstop for a concurrent grant racing the pre-check (near-impossible under single-process, T11).
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ValidationError('Este papel já está atribuído a este usuário nesta unidade.');
      }
      throw error;
    }
  }

  async revokeAssignment(
    scope: AccountingScope,
    assignmentId: string,
    _dto: RevokeAssignmentInput,
  ): Promise<AccessRoleAssignment> {
    this.assertCanManage(scope);
    const assignment = await this.repo.findAssignmentById(scope, assignmentId);
    if (!assignment) throw new NotFoundError(`Atribuição '${assignmentId}' não foi encontrada.`);
    if (assignment.deletedAt) return assignment; // idempotent

    return this.repo.runTransaction(async (tx) => {
      const revoked = await this.repo.updateAssignment(scope, assignmentId, { deletedAt: new Date() }, tx);
      await this.auditService.append(tx, scope, {
        actorUserId: scope.actorUserId,
        eventType: ACCESS_ASSIGNMENT_REVOKED,
        targetType: 'access_role_assignment',
        targetId: assignmentId,
        payload: { assignmentId, roleId: assignment.roleId, subjectUserId: assignment.subjectUserId },
      });
      return revoked;
    });
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  private assertCanManage(scope: AccountingScope): void {
    if (!this.policy.canManageAccessControl(scope)) {
      throw new ForbiddenError('Apenas o dono do escopo pode gerir papéis e atribuições de acesso.');
    }
  }
}
