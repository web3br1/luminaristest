/**
 * Unit tests for DashboardLayoutPolicy — pure authorization (no I/O).
 *
 * Layouts are owner-or-admin for view/update/delete; create needs only a role; `canListAll` is
 * ADMIN-only (the "list everyone's layouts" capability — distinct from a user listing their own).
 */
import { DashboardLayoutPolicy } from '../DashboardLayoutPolicy';
import { Role } from '../../../users/models/User.model';
import type { IDashboardLayout } from '../../models/DashboardLayout.model';
import type { UserContext } from '@/types/UserContext';

const policy = new DashboardLayoutPolicy();

const ctx = (userId: string, role: Role = Role.USER): UserContext => ({
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

const owner = ctx('owner-1');
const stranger = ctx('stranger-1');
const admin = ctx('admin-1', Role.ADMIN);
const unauth = ctx('');
const layout = { id: 'l1', userId: 'owner-1' } as IDashboardLayout;

describe('canListAll (admin-only)', () => {
  it('allows ADMIN', () => expect(policy.canListAll(admin)).toBe(true));
  it('denies a regular USER', () => expect(policy.canListAll(owner)).toBe(false));
  it('denies a caller without userId', () => expect(policy.canListAll(unauth)).toBe(false));
});

describe('canCreate', () => {
  it('allows USER and ADMIN', () => {
    expect(policy.canCreate(owner)).toBe(true);
    expect(policy.canCreate(admin)).toBe(true);
  });
  it('denies a caller without userId', () => expect(policy.canCreate(unauth)).toBe(false));
});

describe('canView / canUpdate / canDelete (owner-or-admin)', () => {
  it('allows the owner', () => {
    expect(policy.canView(owner, layout)).toBe(true);
    expect(policy.canUpdate(owner, layout)).toBe(true);
    expect(policy.canDelete(owner, layout)).toBe(true);
  });

  it('allows an ADMIN on any layout', () => {
    expect(policy.canView(admin, layout)).toBe(true);
    expect(policy.canDelete(admin, layout)).toBe(true);
  });

  it('denies another USER (tenant isolation)', () => {
    expect(policy.canView(stranger, layout)).toBe(false);
    expect(policy.canUpdate(stranger, layout)).toBe(false);
    expect(policy.canDelete(stranger, layout)).toBe(false);
  });

  it('denies a caller without userId', () => expect(policy.canView(unauth, layout)).toBe(false));
});
