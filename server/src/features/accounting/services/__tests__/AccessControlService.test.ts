import { AccessControlService } from '../AccessControlService';
import { ForbiddenError, NotFoundError, ValidationError } from '../../../../lib/errors';
import { resolveAccountingScope } from '../../scope/AccountingScope';
import {
  ACCESS_ASSIGNMENT_REVOKED,
  ACCESS_ROLE_ARCHIVED,
  ACCESS_ROLE_ASSIGNED,
  ACCESS_ROLE_CREATED,
  ACCESS_ROLE_PERMISSIONS_SET,
} from '../../models/AccessControl.model';
import type { AccessRole, AccessRoleAssignment, AccessRolePermission } from 'generated/prisma';

const scope = resolveAccountingScope({ userId: 'owner-1' }, 'unit-1'); // owner === actor
const delegate = { ...scope, actorUserId: 'delegate-1' }; // owner !== actor (membership)

function roleRow(over: Partial<AccessRole> = {}): AccessRole {
  return {
    id: 'role-approver', userId: 'owner-1', unitId: 'unit-1', code: 'APPROVER', name: 'Aprovador',
    status: 'ACTIVE', createdById: 'owner-1', createdAt: new Date(), updatedAt: new Date(), deletedAt: null, ...over,
  } as AccessRole;
}
function assignmentRow(over: Partial<AccessRoleAssignment> = {}): AccessRoleAssignment {
  return {
    id: 'asg-1', userId: 'owner-1', unitId: 'unit-1', subjectUserId: 'delegate-1', roleId: 'role-approver',
    createdById: 'owner-1', createdAt: new Date(), deletedAt: null, ...over,
  } as AccessRoleAssignment;
}
function permRow(over: Partial<AccessRolePermission> = {}): AccessRolePermission {
  return { id: 'p-1', roleId: 'role-approver', permissionKey: 'accounting.entry.approve', createdAt: new Date(), ...over } as AccessRolePermission;
}

interface Opts {
  canManage?: boolean;
  canRead?: boolean;
  role?: AccessRole | null;
  assignment?: AccessRoleAssignment | null;
  existingRoleByCode?: AccessRole | null; // what findRoleByCode returns (null = free code)
  existingBySubjectRole?: AccessRoleAssignment | null; // what findAssignmentBySubjectAndRole returns
  permissionsForActor?: string[];
  rolePermissions?: AccessRolePermission[];
}

function build(opts: Opts = {}) {
  const repo = {
    createRole: jest.fn(async (data: Record<string, unknown>) => roleRow({ id: 'role-new', ...data } as Partial<AccessRole>)),
    findRoleById: jest.fn(async () => (opts.role === undefined ? roleRow() : opts.role)),
    findRoleByCode: jest.fn(async () => opts.existingRoleByCode ?? null),
    findManyRoles: jest.fn(async () => [roleRow()]),
    updateRole: jest.fn(async (_s, id: string, data: Record<string, unknown>) => roleRow({ id, ...data } as Partial<AccessRole>)),
    findPermissionsByRoleIds: jest.fn(async () => opts.rolePermissions ?? [permRow()]),
    replaceRolePermissions: jest.fn(async () => undefined),
    createAssignment: jest.fn(async (data: Record<string, unknown>) => assignmentRow({ id: 'asg-new', ...data } as Partial<AccessRoleAssignment>)),
    findAssignmentById: jest.fn(async () => (opts.assignment === undefined ? assignmentRow() : opts.assignment)),
    findAssignmentBySubjectAndRole: jest.fn(async () => opts.existingBySubjectRole ?? null),
    findManyAssignments: jest.fn(async () => [assignmentRow()]),
    updateAssignment: jest.fn(async (_s, id: string, data: Record<string, unknown>) => assignmentRow({ id, ...data } as Partial<AccessRoleAssignment>)),
    findPermissionsForActor: jest.fn(async () => opts.permissionsForActor ?? []),
    runTransaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
  };
  const auditService = { append: jest.fn(async () => undefined) };
  const policy = {
    canManageAccessControl: () => opts.canManage ?? true,
    canReadAccessControl: () => opts.canRead ?? true,
  };
  const service = new AccessControlService(repo as never, auditService as never, policy as never);
  return { service, repo, auditService };
}

// ── assertPermission — the enforcement primitive ──────────────────────────────
describe('AccessControlService.assertPermission', () => {
  it('OWNER-BYPASS: owner (owner===actor) is always allowed and never hits the DB', async () => {
    const { service, repo } = build();
    await expect(service.assertPermission(scope, 'accounting.entry.approve')).resolves.toBeUndefined();
    expect(repo.findPermissionsForActor).not.toHaveBeenCalled();
  });

  it('DELEGATE WITH permission: passes', async () => {
    const { service } = build({ permissionsForActor: ['accounting.entry.approve'] });
    await expect(service.assertPermission(delegate, 'accounting.entry.approve')).resolves.toBeUndefined();
  });

  it('DELEGATE WITHOUT permission: ForbiddenError (papel sem permissão barra a ação)', async () => {
    const { service, repo } = build({ permissionsForActor: ['accounting.report.read'] });
    await expect(service.assertPermission(delegate, 'accounting.entry.approve')).rejects.toThrow(ForbiddenError);
    // resolution is scoped to the OWNER's silo + the ACTOR as subject (tenancy preserved)
    expect(repo.findPermissionsForActor).toHaveBeenCalledWith(delegate, 'delegate-1', undefined);
  });
});

// ── Role commands ─────────────────────────────────────────────────────────────
describe('AccessControlService.createRole', () => {
  it('creates the role and audits role_created in the same tx', async () => {
    const { service, repo, auditService } = build();
    await service.createRole(scope, { unitId: 'unit-1', code: 'APPROVER', name: 'Aprovador', permissions: [] });
    expect(repo.runTransaction).toHaveBeenCalledTimes(1);
    const data = (repo.createRole.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(data).toMatchObject({ userId: 'owner-1', unitId: 'unit-1', code: 'APPROVER', status: 'ACTIVE', createdById: 'owner-1' });
    expect((auditService.append.mock.calls[0] as unknown[])[2]).toMatchObject({ eventType: ACCESS_ROLE_CREATED });
  });

  it('sets initial permissions when provided', async () => {
    const { service, repo } = build();
    await service.createRole(scope, { unitId: 'unit-1', code: 'APPROVER', name: 'Aprovador', permissions: ['accounting.entry.approve'] });
    expect(repo.replaceRolePermissions).toHaveBeenCalledWith('role-new', ['accounting.entry.approve'], expect.anything());
  });

  it('rejects an ACTIVE duplicate code (pre-check, before any insert)', async () => {
    const { service, repo } = build({ existingRoleByCode: roleRow({ status: 'ACTIVE', deletedAt: null }) });
    await expect(
      service.createRole(scope, { unitId: 'unit-1', code: 'APPROVER', name: 'Aprovador', permissions: [] }),
    ).rejects.toThrow(ValidationError);
    expect(repo.createRole).not.toHaveBeenCalled();
    expect(repo.runTransaction).not.toHaveBeenCalled();
  });

  it('REVIVES an archived same-code role instead of P2002 (unique-x-soft-delete: re-create = unarchive)', async () => {
    const archived = roleRow({ id: 'role-old', status: 'ARCHIVED', deletedAt: new Date() });
    const { service, repo } = build({ existingRoleByCode: archived });
    await service.createRole(scope, { unitId: 'unit-1', code: 'APPROVER', name: 'Aprovador v2', permissions: ['accounting.entry.approve'] });
    // revived in place: updateRole clears the archive; createRole is NOT called (no colliding insert)
    expect(repo.createRole).not.toHaveBeenCalled();
    const upd = (repo.updateRole.mock.calls[0] as unknown[]);
    expect(upd[1]).toBe('role-old');
    expect(upd[2]).toMatchObject({ status: 'ACTIVE', deletedAt: null, name: 'Aprovador v2' });
    // permission set is reset to exactly the requested one
    expect(repo.replaceRolePermissions).toHaveBeenCalledWith('role-old', ['accounting.entry.approve'], expect.anything());
  });

  it('is forbidden for a non-owner (canManageAccessControl false)', async () => {
    const { service } = build({ canManage: false });
    await expect(
      service.createRole(delegate, { unitId: 'unit-1', code: 'APPROVER', name: 'Aprovador', permissions: [] }),
    ).rejects.toThrow(ForbiddenError);
  });
});

describe('AccessControlService.setRolePermissions', () => {
  it('replaces the set and audits role_permissions_set', async () => {
    const { service, repo, auditService } = build();
    await service.setRolePermissions(scope, 'role-approver', { unitId: 'unit-1', permissions: ['accounting.entry.approve', 'accounting.report.read'] });
    expect(repo.replaceRolePermissions).toHaveBeenCalledWith('role-approver', ['accounting.entry.approve', 'accounting.report.read'], expect.anything());
    expect((auditService.append.mock.calls[0] as unknown[])[2]).toMatchObject({ eventType: ACCESS_ROLE_PERMISSIONS_SET });
  });

  it('NotFound when the role does not exist', async () => {
    const { service } = build({ role: null });
    await expect(service.setRolePermissions(scope, 'ghost', { unitId: 'unit-1', permissions: [] })).rejects.toThrow(NotFoundError);
  });

  it('rejects setting permissions on an archived role', async () => {
    const { service } = build({ role: roleRow({ status: 'ARCHIVED' }) });
    await expect(service.setRolePermissions(scope, 'role-approver', { unitId: 'unit-1', permissions: [] })).rejects.toThrow(ValidationError);
  });
});

describe('AccessControlService.archiveRole', () => {
  it('archives (status ARCHIVED + deletedAt) and audits role_archived', async () => {
    const { service, repo, auditService } = build();
    await service.archiveRole(scope, 'role-approver', { unitId: 'unit-1' });
    const data = (repo.updateRole.mock.calls[0] as unknown[])[2] as Record<string, unknown>;
    expect(data.status).toBe('ARCHIVED');
    expect(data.deletedAt).toBeInstanceOf(Date);
    expect((auditService.append.mock.calls[0] as unknown[])[2]).toMatchObject({ eventType: ACCESS_ROLE_ARCHIVED });
  });

  it('is idempotent when already archived (no tx, no audit)', async () => {
    const { service, repo, auditService } = build({ role: roleRow({ status: 'ARCHIVED' }) });
    await service.archiveRole(scope, 'role-approver', { unitId: 'unit-1' });
    expect(repo.runTransaction).not.toHaveBeenCalled();
    expect(auditService.append).not.toHaveBeenCalled();
  });
});

// ── Assignment commands ────────────────────────────────────────────────────────
describe('AccessControlService.assignRole', () => {
  it('creates the assignment and audits role_assigned', async () => {
    const { service, repo, auditService } = build();
    await service.assignRole(scope, { unitId: 'unit-1', subjectUserId: 'delegate-1', roleId: 'role-approver' });
    const data = (repo.createAssignment.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(data).toMatchObject({ userId: 'owner-1', unitId: 'unit-1', subjectUserId: 'delegate-1', roleId: 'role-approver' });
    expect((auditService.append.mock.calls[0] as unknown[])[2]).toMatchObject({ eventType: ACCESS_ROLE_ASSIGNED });
  });

  it('NotFound when the role does not exist', async () => {
    const { service } = build({ role: null });
    await expect(service.assignRole(scope, { unitId: 'unit-1', subjectUserId: 'd', roleId: 'ghost' })).rejects.toThrow(NotFoundError);
  });

  it('rejects assigning an archived role', async () => {
    const { service } = build({ role: roleRow({ status: 'ARCHIVED' }) });
    await expect(service.assignRole(scope, { unitId: 'unit-1', subjectUserId: 'd', roleId: 'role-approver' })).rejects.toThrow(ValidationError);
  });

  it('rejects an ACTIVE duplicate grant (pre-check, before any insert)', async () => {
    const { service, repo } = build({ existingBySubjectRole: assignmentRow({ deletedAt: null }) });
    await expect(service.assignRole(scope, { unitId: 'unit-1', subjectUserId: 'delegate-1', roleId: 'role-approver' })).rejects.toThrow(ValidationError);
    expect(repo.createAssignment).not.toHaveBeenCalled();
    expect(repo.runTransaction).not.toHaveBeenCalled();
  });

  // B1 regression guard: grant → revoke → re-grant is a normal lifecycle and must succeed by REVIVING
  // the revoked row (the non-partial @@unique covers it, so a plain insert would P2002 with a wrong
  // "already assigned" message). This DB-shaped test would fail if the revive path regressed.
  it('REVIVES a revoked grant on re-assign instead of P2002 (grant→revoke→re-grant)', async () => {
    const revoked = assignmentRow({ id: 'asg-old', deletedAt: new Date() });
    const { service, repo, auditService } = build({ existingBySubjectRole: revoked });
    await service.assignRole(scope, { unitId: 'unit-1', subjectUserId: 'delegate-1', roleId: 'role-approver' });
    // revived in place: updateAssignment clears deletedAt; createAssignment is NOT called
    expect(repo.createAssignment).not.toHaveBeenCalled();
    const upd = (repo.updateAssignment.mock.calls[0] as unknown[]);
    expect(upd[1]).toBe('asg-old');
    expect(upd[2]).toMatchObject({ deletedAt: null });
    expect((auditService.append.mock.calls[0] as unknown[])[2]).toMatchObject({ eventType: ACCESS_ROLE_ASSIGNED });
  });
});

describe('AccessControlService.revokeAssignment', () => {
  it('soft-revokes (deletedAt) and audits assignment_revoked', async () => {
    const { service, repo, auditService } = build();
    await service.revokeAssignment(scope, 'asg-1', { unitId: 'unit-1' });
    const data = (repo.updateAssignment.mock.calls[0] as unknown[])[2] as Record<string, unknown>;
    expect(data.deletedAt).toBeInstanceOf(Date);
    expect((auditService.append.mock.calls[0] as unknown[])[2]).toMatchObject({ eventType: ACCESS_ASSIGNMENT_REVOKED });
  });

  it('is idempotent when already revoked', async () => {
    const { service, repo } = build({ assignment: assignmentRow({ deletedAt: new Date() }) });
    await service.revokeAssignment(scope, 'asg-1', { unitId: 'unit-1' });
    expect(repo.runTransaction).not.toHaveBeenCalled();
  });
});

// ── Reads + authz ────────────────────────────────────────────────────────────
describe('AccessControlService.listRoles', () => {
  it('returns roles each with their permission keys', async () => {
    const { service } = build({ rolePermissions: [permRow({ roleId: 'role-approver', permissionKey: 'accounting.entry.approve' })] });
    const out = await service.listRoles(scope, { unitId: 'unit-1', includeArchived: false });
    expect(out[0].role.id).toBe('role-approver');
    expect(out[0].permissions).toEqual(['accounting.entry.approve']);
  });

  it('is forbidden without canReadAccessControl', async () => {
    const { service } = build({ canRead: false });
    await expect(service.listRoles(delegate, { unitId: 'unit-1', includeArchived: false })).rejects.toThrow(ForbiddenError);
  });
});
