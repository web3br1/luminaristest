/**
 * Unit tests for UserPolicy — the authorization matrix (pure, no I/O).
 *
 * This is the cheapest, highest-value layer to cover exhaustively: authorization is a boolean
 * decision with no DB, so every (role × target) combination is locked here. Reference example for
 * the `*.spec.ts` (unit) project.
 */
import { UserPolicy } from '../UserPolicy';
import { Role } from '../../models/User.model';
import type { UserContext } from '@/types/UserContext';

const policy = new UserPolicy();

const actor = (role: Role, userId = 'self'): UserContext => ({
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
const user = actor(Role.USER, 'user-1');

describe('UserPolicy.canListAll', () => {
  it('allows ADMIN', () => expect(policy.canListAll(admin)).toBe(true));
  it('denies USER', () => expect(policy.canListAll(user)).toBe(false));
  it('denies unauthenticated (null)', () => expect(policy.canListAll(null)).toBe(false));
});

describe('UserPolicy.canView', () => {
  it('lets ADMIN view anyone', () => expect(policy.canView(admin, 'someone-else')).toBe(true));
  it('lets a USER view their own profile', () => expect(policy.canView(user, 'user-1')).toBe(true));
  it('forbids a USER from viewing another user (tenant isolation)', () =>
    expect(policy.canView(user, 'user-2')).toBe(false));
  it('denies unauthenticated', () => expect(policy.canView(null, 'user-1')).toBe(false));
});

describe('UserPolicy.canCreate', () => {
  it('allows public signup (null actor)', () => expect(policy.canCreate(null)).toBe(true));
  it('allows ADMIN', () => expect(policy.canCreate(admin)).toBe(true));
  it('forbids a logged-in USER from creating other users', () =>
    expect(policy.canCreate(user)).toBe(false));
});

describe('UserPolicy.canUpdate (owner-or-admin)', () => {
  it('ADMIN can update anyone', () => expect(policy.canUpdate(admin, 'user-2')).toBe(true));
  it('USER can update only themselves', () => {
    expect(policy.canUpdate(user, 'user-1')).toBe(true);
    expect(policy.canUpdate(user, 'user-2')).toBe(false);
  });
  it('unauthenticated cannot update', () => expect(policy.canUpdate(null, 'user-1')).toBe(false));
});

describe('UserPolicy.canDelete (admin-only)', () => {
  // Deleting a User cascade-deletes its business data, so self-service delete is disallowed.
  it('ADMIN can delete anyone', () => expect(policy.canDelete(admin, 'user-2')).toBe(true));
  it('USER cannot delete — not even themselves', () => {
    expect(policy.canDelete(user, 'user-1')).toBe(false);
    expect(policy.canDelete(user, 'user-2')).toBe(false);
  });
  it('unauthenticated cannot delete', () => expect(policy.canDelete(null, 'user-1')).toBe(false));
});

describe('UserPolicy.canChangeRole', () => {
  it('only ADMIN can change roles', () => {
    expect(policy.canChangeRole(admin)).toBe(true);
    expect(policy.canChangeRole(user)).toBe(false);
    expect(policy.canChangeRole(null)).toBe(false);
  });
});
