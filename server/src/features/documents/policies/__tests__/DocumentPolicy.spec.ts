/**
 * Unit tests for DocumentPolicy — the authorization matrix (pure, no I/O).
 *
 * Documents are owner-or-admin for view/update/delete, and any authenticated user may create/list
 * (the list is then scoped to their own userId in the service). Every (actor × ownership) combination
 * is locked here. Reference example for the `*.spec.ts` (unit) project. See `users/UserPolicy.spec`.
 */
import { DocumentPolicy } from '../DocumentPolicy';
import type { IDocument } from '../../models/Document.model';
import { Role } from '../../../users/models/User.model';
import type { UserContext } from '@/lib/authUtils';

const policy = new DocumentPolicy();

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

const owner = actor(Role.USER, 'owner-1');
const stranger = actor(Role.USER, 'stranger-1');
const admin = actor(Role.ADMIN, 'admin-1');

/** A document owned by 'owner-1'; only the fields the policy reads matter. */
const doc = { id: 'doc-1', userId: 'owner-1' } as IDocument;

describe('DocumentPolicy.canCreate / canListAll', () => {
  it('allows any authenticated user', () => {
    expect(policy.canCreate(owner)).toBe(true);
    expect(policy.canListAll(owner)).toBe(true);
  });

  it('denies an unauthenticated caller (null)', () => {
    expect(policy.canCreate(null)).toBe(false);
    expect(policy.canListAll(null)).toBe(false);
  });
});

describe('DocumentPolicy.canView (owner-or-admin)', () => {
  it('lets the owner view their own document', () => expect(policy.canView(owner, doc)).toBe(true));
  it('lets an ADMIN view any document', () => expect(policy.canView(admin, doc)).toBe(true));
  it('forbids another user (tenant isolation)', () => expect(policy.canView(stranger, doc)).toBe(false));
  it('denies unauthenticated', () => expect(policy.canView(null, doc)).toBe(false));
});

describe('DocumentPolicy.canUpdate (owner-or-admin)', () => {
  it('lets the owner update', () => expect(policy.canUpdate(owner, doc)).toBe(true));
  it('lets an ADMIN update anyone', () => expect(policy.canUpdate(admin, doc)).toBe(true));
  it('forbids another user', () => expect(policy.canUpdate(stranger, doc)).toBe(false));
  it('denies unauthenticated', () => expect(policy.canUpdate(null, doc)).toBe(false));
});

describe('DocumentPolicy.canDelete (owner-or-admin)', () => {
  it('lets the owner delete', () => expect(policy.canDelete(owner, doc)).toBe(true));
  it('lets an ADMIN delete anyone', () => expect(policy.canDelete(admin, doc)).toBe(true));
  it('forbids another user', () => expect(policy.canDelete(stranger, doc)).toBe(false));
  it('denies unauthenticated', () => expect(policy.canDelete(null, doc)).toBe(false));
});
