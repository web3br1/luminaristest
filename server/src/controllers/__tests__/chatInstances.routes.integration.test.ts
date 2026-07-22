/**
 * HTTP / contract tests for the chat-instances routes — real Express app over supertest + real DB.
 * Locks: auth (401), DTO rejection (400), Tier-0 ownership (403), duplicate → 409, the idempotent
 * get-or-create, the response envelope, and that list rows carry no `userId`.
 *
 * Run via `npm run test:integration`.
 */
import request from 'supertest';
import { makeApp, pushTestSchema, resetDb, disconnectDb, seedUser, seedChatInstance, authHeader } from '@test/helpers';

const app = makeApp();

beforeAll(() => {
  pushTestSchema();
}, 120000);

afterEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await disconnectDb();
});

describe('GET /api/chat-instances', () => {
  it('401s without a token', async () => {
    const res = await request(app).get('/api/chat-instances');
    expect(res.status).toBe(401);
  });

  it('200s with the caller summaries (no userId) and pagination meta', async () => {
    const owner = await seedUser({ username: 'owner' });
    const other = await seedUser({ username: 'other' });
    await seedChatInstance({ userId: owner.id, widgetInstanceId: 'a' });
    await seedChatInstance({ userId: other.id, widgetInstanceId: 'b' });

    const res = await request(app)
      .get('/api/chat-instances')
      .set(authHeader({ id: owner.id, username: owner.username }));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.total).toBe(1);
    expect(res.body.data[0]).not.toHaveProperty('userId');
  });

  it('filters by type', async () => {
    const u = await seedUser({ username: 'u' });
    await seedChatInstance({ userId: u.id, widgetInstanceId: 'doc', type: 'DOCUMENT' });
    await seedChatInstance({ userId: u.id, widgetInstanceId: 'gen', type: 'GENERIC' });

    const res = await request(app)
      .get('/api/chat-instances?type=GENERIC')
      .set(authHeader({ id: u.id, username: u.username }));
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].widgetInstanceId).toBe('gen');
  });
});

describe('POST /api/chat-instances', () => {
  it('401s without a token', async () => {
    const res = await request(app).post('/api/chat-instances').send({ title: null, widgetInstanceId: 'w' });
    expect(res.status).toBe(401);
  });

  it('201s on valid input', async () => {
    const u = await seedUser({ username: 'u' });
    const res = await request(app)
      .post('/api/chat-instances')
      .set(authHeader({ id: u.id, username: u.username }))
      .send({ title: null, type: 'GENERIC', widgetInstanceId: 'w1' });
    expect(res.status).toBe(201);
    expect(res.body.data.widgetInstanceId).toBe('w1');
  });

  it('400s when the DTO rejects the body (missing widgetInstanceId)', async () => {
    const u = await seedUser({ username: 'u' });
    const res = await request(app)
      .post('/api/chat-instances')
      .set(authHeader({ id: u.id, username: u.username }))
      .send({ title: null });
    expect(res.status).toBe(400);
  });

  it('409s on a duplicate (userId, widgetInstanceId)', async () => {
    const u = await seedUser({ username: 'u' });
    await seedChatInstance({ userId: u.id, widgetInstanceId: 'dup' });
    const res = await request(app)
      .post('/api/chat-instances')
      .set(authHeader({ id: u.id, username: u.username }))
      .send({ title: null, type: 'GENERIC', widgetInstanceId: 'dup' });
    expect(res.status).toBe(409);
  });
});

describe('POST /api/chat-instances/get-or-create (idempotent)', () => {
  it('returns the same instance on repeated calls', async () => {
    const u = await seedUser({ username: 'u' });
    const auth = authHeader({ id: u.id, username: u.username });
    const first = await request(app).post('/api/chat-instances/get-or-create').set(auth).send({ widgetInstanceId: 'wx', type: 'GENERIC' });
    const second = await request(app).post('/api/chat-instances/get-or-create').set(auth).send({ widgetInstanceId: 'wx', type: 'GENERIC' });
    expect(first.status).toBe(200);
    expect(second.body.data.id).toBe(first.body.data.id);
  });
});

describe('PUT /api/chat-instances/:id', () => {
  it('401s without a token', async () => {
    const u = await seedUser({ username: 'u' });
    const ci = await seedChatInstance({ userId: u.id });
    const res = await request(app).put(`/api/chat-instances/${ci.id}`).send({ title: 'x' });
    expect(res.status).toBe(401);
  });

  it('lets the owner rename (200)', async () => {
    const u = await seedUser({ username: 'owner' });
    const ci = await seedChatInstance({ userId: u.id, title: 'Old' });
    const res = await request(app)
      .put(`/api/chat-instances/${ci.id}`)
      .set(authHeader({ id: u.id, username: u.username }))
      .send({ title: 'New' });
    expect(res.status).toBe(200);
    expect(res.body.data.title).toBe('New');
  });

  it('403s when another USER updates it', async () => {
    const owner = await seedUser({ username: 'owner' });
    const stranger = await seedUser({ username: 'stranger' });
    const ci = await seedChatInstance({ userId: owner.id });
    const res = await request(app)
      .put(`/api/chat-instances/${ci.id}`)
      .set(authHeader({ id: stranger.id, username: stranger.username }))
      .send({ title: 'Hacked' });
    expect(res.status).toBe(403);
  });

  it('400s on a malformed (non-cuid) id', async () => {
    const u = await seedUser({ username: 'u' });
    const res = await request(app)
      .put('/api/chat-instances/not-a-cuid')
      .set(authHeader({ id: u.id, username: u.username }))
      .send({ title: 'x' });
    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/chat-instances/:id', () => {
  it('401s without a token', async () => {
    const u = await seedUser({ username: 'u' });
    const ci = await seedChatInstance({ userId: u.id });
    const res = await request(app).delete(`/api/chat-instances/${ci.id}`);
    expect(res.status).toBe(401);
  });

  it('200s when the owner deletes', async () => {
    const u = await seedUser({ username: 'owner' });
    const ci = await seedChatInstance({ userId: u.id });
    const res = await request(app)
      .delete(`/api/chat-instances/${ci.id}`)
      .set(authHeader({ id: u.id, username: u.username }));
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('403s when another USER deletes it', async () => {
    const owner = await seedUser({ username: 'owner' });
    const stranger = await seedUser({ username: 'stranger' });
    const ci = await seedChatInstance({ userId: owner.id });
    const res = await request(app)
      .delete(`/api/chat-instances/${ci.id}`)
      .set(authHeader({ id: stranger.id, username: stranger.username }));
    expect(res.status).toBe(403);
  });
});
