/**
 * Integration tests for ChatInstanceService — real SQLite with the real repository + policy.
 *
 * Covers: Tier-0 (a USER only touches their own instances), the unique (userId, widgetInstanceId)
 * constraint, the idempotent get-or-create, the typed-error contract, and that lists return
 * summaries WITHOUT `userId`.
 *
 * Run via `npm run test:integration`.
 */
import { ChatInstanceService } from '../ChatInstanceService';
import { ChatInstanceRepository } from '../../repositories/ChatInstanceRepository';
import { ChatInstancePolicy } from '../../policies/ChatInstancePolicy';
import { ForbiddenError, NotFoundError, UnauthorizedError } from '@/lib/errors';
import { pushTestSchema, resetDb, disconnectDb, seedUser, seedChatInstance, ctxFor } from '@test/helpers';

const service = new ChatInstanceService(new ChatInstanceRepository(), new ChatInstancePolicy());

beforeAll(() => {
  pushTestSchema();
}, 120000);

afterEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await disconnectDb();
});

describe('createInstance', () => {
  it('creates an instance owned by the caller', async () => {
    const u = await seedUser({ username: 'u' });
    const created = await service.createInstance(
      { title: null, type: 'GENERIC', widgetInstanceId: 'w1' },
      ctxFor({ id: u.id, username: u.username })
    );
    expect(created.userId).toBe(u.id);
    expect(created.widgetInstanceId).toBe('w1');
  });

  it('rejects a duplicate (userId, widgetInstanceId) — unique constraint', async () => {
    const u = await seedUser({ username: 'u' });
    await seedChatInstance({ userId: u.id, widgetInstanceId: 'dup' });
    await expect(
      service.createInstance({ title: null, type: 'GENERIC', widgetInstanceId: 'dup' }, ctxFor({ id: u.id, username: u.username }))
    ).rejects.toThrow();
  });

  it('throws UnauthorizedError without a userId', async () => {
    const ctx = { ...ctxFor({ id: 'x', username: 'x' }), userId: '' };
    await expect(
      service.createInstance({ title: null, type: 'GENERIC', widgetInstanceId: 'w' }, ctx)
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });
});

describe('getInstanceById (Tier-0)', () => {
  it('lets the owner read their instance', async () => {
    const u = await seedUser({ username: 'owner' });
    const ci = await seedChatInstance({ userId: u.id });
    const got = await service.getInstanceById(ci.id, ctxFor({ id: u.id, username: u.username }));
    expect(got.id).toBe(ci.id);
  });

  it('forbids another USER (ForbiddenError)', async () => {
    const owner = await seedUser({ username: 'owner' });
    const stranger = await seedUser({ username: 'stranger' });
    const ci = await seedChatInstance({ userId: owner.id });
    await expect(
      service.getInstanceById(ci.id, ctxFor({ id: stranger.id, username: stranger.username }))
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('throws NotFoundError for a missing instance', async () => {
    const u = await seedUser({ username: 'u' });
    await expect(
      service.getInstanceById('cl00000000000000000000000', ctxFor({ id: u.id, username: u.username }))
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('getAllInstances / getInstancesByUser', () => {
  it('returns only the caller instances as summaries (no userId field)', async () => {
    const owner = await seedUser({ username: 'owner' });
    const other = await seedUser({ username: 'other' });
    await seedChatInstance({ userId: owner.id, widgetInstanceId: 'a' });
    await seedChatInstance({ userId: owner.id, widgetInstanceId: 'b' });
    await seedChatInstance({ userId: other.id, widgetInstanceId: 'c' });

    const { instances, totalCount } = await service.getAllInstances(ctxFor({ id: owner.id, username: owner.username }), 1, 10);
    expect(totalCount).toBe(2);
    for (const inst of instances) expect(inst).not.toHaveProperty('userId');
  });

  it('filters by type', async () => {
    const u = await seedUser({ username: 'u' });
    await seedChatInstance({ userId: u.id, widgetInstanceId: 'doc', type: 'DOCUMENT' });
    await seedChatInstance({ userId: u.id, widgetInstanceId: 'gen', type: 'GENERIC' });

    const docs = await service.getInstancesByUser(ctxFor({ id: u.id, username: u.username }), 'DOCUMENT');
    expect(docs).toHaveLength(1);
    expect(docs[0].widgetInstanceId).toBe('doc');
  });
});

describe('getOrCreateInstance (idempotent)', () => {
  it('creates on first call and returns the SAME instance on the second', async () => {
    const u = await seedUser({ username: 'u' });
    const ctx = ctxFor({ id: u.id, username: u.username });

    const first = await service.getOrCreateInstance('widget-x', 'GENERIC', ctx);
    const second = await service.getOrCreateInstance('widget-x', 'GENERIC', ctx);

    expect(second.id).toBe(first.id);
    const { totalCount } = await service.getAllInstances(ctx, 1, 10);
    expect(totalCount).toBe(1); // not duplicated
  });
});

describe('updateInstance (Tier-0)', () => {
  it('lets the owner rename their instance', async () => {
    const u = await seedUser({ username: 'owner' });
    const ci = await seedChatInstance({ userId: u.id, title: 'Old' });
    const updated = await service.updateInstance(ci.id, { title: 'New' }, ctxFor({ id: u.id, username: u.username }));
    expect(updated.title).toBe('New');
  });

  it('forbids another USER (ForbiddenError)', async () => {
    const owner = await seedUser({ username: 'owner' });
    const stranger = await seedUser({ username: 'stranger' });
    const ci = await seedChatInstance({ userId: owner.id });
    await expect(
      service.updateInstance(ci.id, { title: 'Hacked' }, ctxFor({ id: stranger.id, username: stranger.username }))
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('throws NotFoundError for a missing instance', async () => {
    const u = await seedUser({ username: 'u' });
    await expect(
      service.updateInstance('cl00000000000000000000000', { title: 'x' }, ctxFor({ id: u.id, username: u.username }))
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('deleteInstance (Tier-0)', () => {
  it('lets the owner delete their instance', async () => {
    const u = await seedUser({ username: 'owner' });
    const ci = await seedChatInstance({ userId: u.id });
    await expect(service.deleteInstance(ci.id, ctxFor({ id: u.id, username: u.username }))).resolves.toBeUndefined();
    await expect(
      service.getInstanceById(ci.id, ctxFor({ id: u.id, username: u.username }))
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('forbids another USER (ForbiddenError) and keeps the instance', async () => {
    const owner = await seedUser({ username: 'owner' });
    const stranger = await seedUser({ username: 'stranger' });
    const ci = await seedChatInstance({ userId: owner.id });
    await expect(
      service.deleteInstance(ci.id, ctxFor({ id: stranger.id, username: stranger.username }))
    ).rejects.toBeInstanceOf(ForbiddenError);
    const got = await service.getInstanceById(ci.id, ctxFor({ id: owner.id, username: owner.username }));
    expect(got.id).toBe(ci.id);
  });
});
