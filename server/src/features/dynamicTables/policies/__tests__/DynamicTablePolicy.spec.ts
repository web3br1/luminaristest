/**
 * Unit tests for DynamicTablePolicy — the authorization matrix (pure, no I/O).
 *
 * dynamicTables has an EXCLUSIVE policy shape (see the feature README "Justified variants"):
 *  - Table STRUCTURE ops (create/update/delete) are system-only → the policy always returns false;
 *    structure changes go through the service's `*AsSystem` methods, never a user request.
 *  - Authorization of DATA (rows) is governed by `canManageData`, which is owner-only EXCEPT that
 *    tables flagged `ui.presentation: 'system'` are infra and never editable by end-users.
 *  - `canView` is the only owner-OR-admin gate. There is no `canListAll` (the list is scoped by
 *    userId directly in the service).
 *
 * The null/unauthenticated case is handled by the service (`if (!user.userId) throw Unauthorized`),
 * not the policy — its signatures take a non-null UserContext — so it is not exercised here.
 */
import { DynamicTablePolicy } from '../DynamicTablePolicy';
import type { IDynamicTable, ITableSchema } from '../../models/DynamicTable.model';
import { Role } from '../../../users/models/User.model';
import type { UserContext } from '@/lib/authUtils';

const policy = new DynamicTablePolicy();

const actor = (role: Role, userId: string): UserContext => ({
  id: userId,
  userId,
  name: 'n',
  username: 'u',
  email: 'u@test.co',
  userEmail: 'u@test.co',
  role,
  userRole: role,
  createdAt: new Date(),
  updatedAt: new Date(),
});

const admin = actor(Role.ADMIN, 'admin-1');
const owner = actor(Role.USER, 'owner-1');
const stranger = actor(Role.USER, 'stranger-1');

const tableOf = (ownerId: string, schema: ITableSchema = { fields: [] }): IDynamicTable => ({
  id: 'tbl-1',
  userId: ownerId,
  name: 'Products',
  internalName: 'products',
  category: 'inventory',
  schema,
  createdAt: new Date(),
  updatedAt: new Date(),
});

describe('DynamicTablePolicy.canView (owner-or-admin)', () => {
  it('lets the owner view their table', () =>
    expect(policy.canView(owner, tableOf('owner-1'))).toBe(true));
  it('lets an ADMIN view any table', () =>
    expect(policy.canView(admin, tableOf('owner-1'))).toBe(true));
  it('forbids another USER (tenant isolation)', () =>
    expect(policy.canView(stranger, tableOf('owner-1'))).toBe(false));
});

describe('DynamicTablePolicy structure ops are system-only', () => {
  it('canCreate is always false — even for ADMIN (creation is a system process)', () => {
    expect(policy.canCreate(owner)).toBe(false);
    expect(policy.canCreate(admin)).toBe(false);
  });
  it('canUpdate (structure) is always false', () => {
    expect(policy.canUpdate(owner, tableOf('owner-1'))).toBe(false);
    expect(policy.canUpdate(admin, tableOf('owner-1'))).toBe(false);
  });
  it('canDelete (structure) is always false', () => {
    expect(policy.canDelete(owner, tableOf('owner-1'))).toBe(false);
    expect(policy.canDelete(admin, tableOf('owner-1'))).toBe(false);
  });
});

describe('DynamicTablePolicy.canManageData (owner-only, system tables locked)', () => {
  it('lets the owner manage their data', () =>
    expect(policy.canManageData(owner, tableOf('owner-1'))).toBe(true));
  it('forbids another USER from managing the data', () =>
    expect(policy.canManageData(stranger, tableOf('owner-1'))).toBe(false));
  it('does NOT grant a non-owner ADMIN data access (data is owner-scoped, unlike canView)', () =>
    expect(policy.canManageData(admin, tableOf('owner-1'))).toBe(false));
  it('locks tables flagged ui.presentation = "system" even for the owner', () => {
    const systemTable = tableOf('owner-1', { fields: [], ui: { presentation: 'system' } });
    expect(policy.canManageData(owner, systemTable)).toBe(false);
  });
  it('allows standalone/embedded presentation tables for the owner', () => {
    const standalone = tableOf('owner-1', { fields: [], ui: { presentation: 'standalone' } });
    expect(policy.canManageData(owner, standalone)).toBe(true);
  });
});
