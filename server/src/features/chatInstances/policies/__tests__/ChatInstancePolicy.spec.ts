/**
 * Unit tests for ChatInstancePolicy — pure authorization (no I/O).
 *
 * A chat instance is private to its owner: view/update/delete require `instance.userId === ctx.userId`
 * (no admin bypass — conversations are tenant-private). create/list need only authentication.
 */
import { ChatInstancePolicy } from '../ChatInstancePolicy';
import { Role } from '../../../users/models/User.model';
import type { IChatInstance } from '../../models/ChatInstance.model';
import type { UserContext } from '@/types/UserContext';

const policy = new ChatInstancePolicy();

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

const unauth = ctx(''); // no userId
const instance = { id: 'ci-1', userId: 'owner-1' } as IChatInstance;

describe('ChatInstancePolicy.canCreate / canListAll', () => {
  it('allows any authenticated user', () => {
    expect(policy.canCreate(ctx('u1'))).toBe(true);
    expect(policy.canListAll(ctx('u1'))).toBe(true);
  });
  it('denies a caller without userId', () => {
    expect(policy.canCreate(unauth)).toBe(false);
    expect(policy.canListAll(unauth)).toBe(false);
  });
});

describe('ChatInstancePolicy.canView / canUpdate / canDelete (owner-only)', () => {
  it('allows the owner', () => {
    expect(policy.canView(ctx('owner-1'), instance)).toBe(true);
    expect(policy.canUpdate(ctx('owner-1'), instance)).toBe(true);
    expect(policy.canDelete(ctx('owner-1'), instance)).toBe(true);
  });

  it('denies another user (tenant isolation)', () => {
    expect(policy.canView(ctx('stranger'), instance)).toBe(false);
    expect(policy.canUpdate(ctx('stranger'), instance)).toBe(false);
    expect(policy.canDelete(ctx('stranger'), instance)).toBe(false);
  });

  it('denies even an ADMIN who is not the owner (no admin bypass)', () => {
    expect(policy.canView(ctx('admin-1', Role.ADMIN), instance)).toBe(false);
    expect(policy.canDelete(ctx('admin-1', Role.ADMIN), instance)).toBe(false);
  });
});
