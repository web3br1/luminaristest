/**
 * HTTP / contract tests for the chat-messages routes — real Express app over supertest + real DB.
 * Locks: auth (401), DTO/instanceId rejection (400), Tier-0 ownership of the parent instance (403),
 * NotFound (404), the additive pagination meta, and that REST creation persists a USER message.
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

describe('GET /api/chat-messages', () => {
  it('401s without a token', async () => {
    const res = await request(app).get('/api/chat-messages?instanceId=cl00000000000000000000000');
    expect(res.status).toBe(401);
  });

  it('400s on a missing/invalid instanceId', async () => {
    const u = await seedUser({ username: 'u' });
    const res = await request(app).get('/api/chat-messages').set(authHeader({ id: u.id, username: u.username }));
    expect(res.status).toBe(400);
  });

  it('lets the owner read the full thread (200)', async () => {
    const u = await seedUser({ username: 'owner' });
    const ci = await seedChatInstance({ userId: u.id });
    const res = await request(app)
      .get(`/api/chat-messages?instanceId=${ci.id}`)
      .set(authHeader({ id: u.id, username: u.username }));
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('403s when reading ANOTHER user instance thread', async () => {
    const owner = await seedUser({ username: 'owner' });
    const stranger = await seedUser({ username: 'stranger' });
    const ci = await seedChatInstance({ userId: owner.id });
    const res = await request(app)
      .get(`/api/chat-messages?instanceId=${ci.id}`)
      .set(authHeader({ id: stranger.id, username: stranger.username }));
    expect(res.status).toBe(403);
  });

  it('returns pagination meta when page/pageSize are provided', async () => {
    const u = await seedUser({ username: 'owner' });
    const ci = await seedChatInstance({ userId: u.id });
    const res = await request(app)
      .get(`/api/chat-messages?instanceId=${ci.id}&page=1&pageSize=10`)
      .set(authHeader({ id: u.id, username: u.username }));
    expect(res.status).toBe(200);
    expect(res.body.page).toBe(1);
    expect(res.body.pageSize).toBe(10);
    expect(typeof res.body.total).toBe('number');
  });
});

describe('POST /api/chat-messages', () => {
  it('401s without a token', async () => {
    const res = await request(app).post('/api/chat-messages').send({ content: 'hi', chatInstanceId: 'cl00000000000000000000000' });
    expect(res.status).toBe(401);
  });

  it('400s on an invalid body (empty content)', async () => {
    const u = await seedUser({ username: 'u' });
    const ci = await seedChatInstance({ userId: u.id });
    const res = await request(app)
      .post('/api/chat-messages')
      .set(authHeader({ id: u.id, username: u.username }))
      .send({ content: '', chatInstanceId: ci.id });
    expect(res.status).toBe(400);
  });

  it('201s and persists a USER message for the owner', async () => {
    const u = await seedUser({ username: 'owner' });
    const ci = await seedChatInstance({ userId: u.id });
    const res = await request(app)
      .post('/api/chat-messages')
      .set(authHeader({ id: u.id, username: u.username }))
      .send({ content: 'hello', chatInstanceId: ci.id });
    expect(res.status).toBe(201);
    expect(res.body.data.content).toBe('hello');
    expect(res.body.data.role).toBe('user');
  });

  it('403s when posting to ANOTHER user instance', async () => {
    const owner = await seedUser({ username: 'owner' });
    const stranger = await seedUser({ username: 'stranger' });
    const ci = await seedChatInstance({ userId: owner.id });
    const res = await request(app)
      .post('/api/chat-messages')
      .set(authHeader({ id: stranger.id, username: stranger.username }))
      .send({ content: 'leak', chatInstanceId: ci.id });
    expect(res.status).toBe(403);
  });

  it('404s when the instance does not exist', async () => {
    const u = await seedUser({ username: 'u' });
    const res = await request(app)
      .post('/api/chat-messages')
      .set(authHeader({ id: u.id, username: u.username }))
      .send({ content: 'hi', chatInstanceId: 'cl00000000000000000000000' });
    expect(res.status).toBe(404);
  });
});
