/**
 * Unit tests for StructuredDataPolicy — pure authorization, the document repository faked.
 *
 * The distinguishing rule of this feature: `canAccess` is **owner-ONLY, with NO admin bypass**
 * (structured data is the tenant's private document content — stricter than the owner-or-admin
 * default elsewhere). These tests lock exactly that: an ADMIN who is not the owner is denied.
 */
import { StructuredDataPolicy } from '../StructuredDataPolicy';
import { Role } from '../../../users/models/User.model';
import type { UserContext } from '@/types/UserContext';

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

/** Builds a policy whose document repository returns the given document for findById. */
function makePolicy(document: { userId: string } | null) {
  const documentRepository = { findById: jest.fn().mockResolvedValue(document) };
  return { policy: new StructuredDataPolicy(documentRepository as any), documentRepository };
}

describe('StructuredDataPolicy.canAccess (owner-only, no admin bypass)', () => {
  it('allows the document owner', async () => {
    const { policy } = makePolicy({ userId: 'owner-1' });
    expect(await policy.canAccess(ctx('owner-1'), 'doc-1')).toBe(true);
  });

  it('denies another USER (tenant isolation)', async () => {
    const { policy } = makePolicy({ userId: 'owner-1' });
    expect(await policy.canAccess(ctx('stranger-1'), 'doc-1')).toBe(false);
  });

  it('denies an ADMIN who is NOT the owner — there is no admin bypass', async () => {
    const { policy } = makePolicy({ userId: 'owner-1' });
    expect(await policy.canAccess(ctx('admin-1', Role.ADMIN), 'doc-1')).toBe(false);
  });

  it('denies access when the document does not exist', async () => {
    const { policy } = makePolicy(null);
    expect(await policy.canAccess(ctx('anyone'), 'missing-doc')).toBe(false);
  });
});
