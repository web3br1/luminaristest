/**
 * Tests for ChatInstanceService tenant isolation (R15).
 *
 * Verifies that a user can only access their own chat instances — never
 * those belonging to another user — even when correct IDs are supplied.
 *
 * Uses a mocked IChatInstanceRepository and IChatInstancePolicy so no
 * database or Prisma connection is needed.
 */

import { ChatInstanceService } from '../services/ChatInstanceService';
import type { IChatInstanceRepository } from '../repositories/IChatInstanceRepository';
import type { IChatInstancePolicy } from '../policies/IChatInstancePolicy';
import type { IChatInstance, IChatInstanceSummary } from '../models/ChatInstance.model';
import { NotFoundError, ForbiddenError } from '../../../lib/errors';
import { UserContext } from '../../../types/UserContext';
import { Role } from '../../users/models/User.model';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const now = new Date('2026-01-01T00:00:00Z');

function makeInstance(overrides: Partial<IChatInstance> = {}): IChatInstance {
  return {
    id: 'instance-a1',
    widgetInstanceId: 'widget-a1',
    title: 'Instance A1',
    type: 'DOCUMENT',
    userId: 'user-A',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function makeUserContext(userId: string, role: Role = Role.USER): UserContext {
  return {
    userId,
    id: userId,
    name: 'Test User',
    username: 'testuser',
    email: 'test@example.com',
    role,
    createdAt: now,
    updatedAt: now,
    userRole: role,
    userEmail: 'test@example.com',
    userName: 'Test User',
  };
}

// ---------------------------------------------------------------------------
// Helpers to build mocks
// ---------------------------------------------------------------------------

function makePermissivePolicy(): IChatInstancePolicy {
  return {
    canCreate: () => true,
    canListAll: () => true,
    canView: (_ctx, instance) => instance.userId === _ctx.userId,
    canUpdate: (_ctx, instance) => instance.userId === _ctx.userId,
    canDelete: (_ctx, instance) => instance.userId === _ctx.userId,
  };
}

function makeRepository(
  instancesForUserA: IChatInstance[],
  instancesForUserB: IChatInstance[]
): IChatInstanceRepository {
  // getInstanceById: only returns instance if userId matches
  return {
    createInstance: jest.fn(),
    getAllInstances: jest.fn(async (userId: string, page = 1, limit = 10) => {
      const all = userId === 'user-A' ? instancesForUserA : instancesForUserB;
      const start = (page - 1) * limit;
      const instances = all.slice(start, start + limit) as IChatInstanceSummary[];
      return { instances, totalCount: all.length };
    }),
    // Fork design: repository fetch is UNSCOPED (1-arg); tenancy is enforced by the policy layer.
    getInstanceById: jest.fn(async (id: string) => {
      const all = [...instancesForUserA, ...instancesForUserB];
      return all.find((i) => i.id === id) ?? null;
    }),
    getInstancesByUser: jest.fn(async (userId: string) => {
      return userId === 'user-A' ? instancesForUserA : instancesForUserB;
    }),
    updateInstance: jest.fn(),
    deleteInstance: jest.fn(),
  } as unknown as IChatInstanceRepository;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ChatInstanceService — tenant isolation', () => {
  const instanceA1 = makeInstance({ id: 'instance-a1', userId: 'user-A', title: 'A Instance 1' });
  const instanceA2 = makeInstance({ id: 'instance-a2', userId: 'user-A', title: 'A Instance 2', widgetInstanceId: 'widget-a2' });

  const ctxA = makeUserContext('user-A');
  const ctxB = makeUserContext('user-B');

  let service: ChatInstanceService;
  let repo: IChatInstanceRepository;

  beforeEach(() => {
    repo = makeRepository([instanceA1, instanceA2], []); // user-B has no instances
    service = new ChatInstanceService(repo, makePermissivePolicy());
  });

  describe('getAllInstances', () => {
    it('returns only instances belonging to user-A when called with user-A context', async () => {
      const result = await service.getAllInstances(ctxA);

      expect(result.instances).toHaveLength(2);
      result.instances.forEach((inst) => {
        // The summary DTO does not expose userId; verify the repository was called
        // with the correct userId so the DB filter would enforce ownership.
        expect(repo.getAllInstances).toHaveBeenCalledWith('user-A', undefined, undefined);
      });
    });

    it('returns an empty list for user-B who has no instances (not user-A instances)', async () => {
      const result = await service.getAllInstances(ctxB);

      expect(result.instances).toHaveLength(0);
      expect(result.totalCount).toBe(0);
      // Ensure the repository was called with user-B's ID, not user-A's
      expect(repo.getAllInstances).toHaveBeenCalledWith('user-B', undefined, undefined);
    });

    it('never returns user-A instances to user-B', async () => {
      const resultA = await service.getAllInstances(ctxA);
      const resultB = await service.getAllInstances(ctxB);

      const idsForA = resultA.instances.map((i) => i.id);
      const idsForB = resultB.instances.map((i) => i.id);

      // No overlap
      const overlap = idsForA.filter((id) => idsForB.includes(id));
      expect(overlap).toHaveLength(0);
    });
  });

  describe('getInstanceById', () => {
    it('returns the instance when user-A requests their own instance', async () => {
      const result = await service.getInstanceById('instance-a1', ctxA);

      expect(result.id).toBe('instance-a1');
    });

    it('throws ForbiddenError when user-B requests an instance owned by user-A (policy gate)', async () => {
      // Fork design adopted 2026-07-21: the repository fetch is unscoped and the ChatInstancePolicy
      // is the tenancy gate (403). This trades the previous existence-masking 404 for explicit
      // policy semantics; access is still denied.
      await expect(service.getInstanceById('instance-a1', ctxB)).rejects.toThrow(ForbiddenError);
    });

    it('still 404s for an id that does not exist at all', async () => {
      await expect(service.getInstanceById('missing-id', ctxB)).rejects.toThrow(NotFoundError);
    });
  });
});
