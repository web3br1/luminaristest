/**
 * HTTP / contract tests for POST /api/chat — drives the real app over supertest against the real DB.
 *
 * Scope note: chat generation calls OpenAI, which we don't exercise here (covered by the faked
 * ChatService.spec). These tests lock the contract BOUNDARY that runs BEFORE any model call:
 * authentication (401), DTO rejection (400), and the Tier-0 ownership check on `chatInstanceId`
 * (403/404) — `generateResponse` persists the user message first, so a foreign instance is rejected
 * before generation ever starts.
 */
import request from 'supertest';
import prisma from '@/lib/prisma';
import { Role } from '@/features/users/models/User.model';
import { makeApp, pushTestSchema, resetDb, disconnectDb, seedUser, authHeader } from '@test/helpers';

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

const auth = (id: string, username: string) => authHeader({ id, username, role: Role.USER });

describe('POST /api/chat', () => {
  it('401s without a token (fail-closed; /api/chat is protected)', async () => {
    const res = await request(app).post('/api/chat').send({ query: 'hi' });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
  });

  it('400s when the DTO rejects the body (malformed history)', async () => {
    const u = await seedUser({ username: 'alice' });
    const res = await request(app)
      .post('/api/chat')
      .set(auth(u.id, u.username))
      .send({ history: 'not-an-array' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('403s when posting to ANOTHER user\'s chatInstanceId (Tier-0, before any model call)', async () => {
    const alice = await seedUser({ username: 'alice' });
    const bob = await seedUser({ username: 'bob' });
    const bobsInstance = await prisma.chatInstance.create({
      data: { widgetInstanceId: 'w1', userId: bob.id, type: 'GENERIC' },
    });

    const res = await request(app)
      .post('/api/chat')
      .set(auth(alice.id, alice.username))
      .send({ query: 'leak bob\'s data', chatInstanceId: bobsInstance.id });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('404s when the chatInstanceId does not exist', async () => {
    const alice = await seedUser({ username: 'alice' });
    const res = await request(app)
      .post('/api/chat')
      .set(auth(alice.id, alice.username))
      .send({ query: 'hi', chatInstanceId: 'cl00000000000000000000000' });
    expect(res.status).toBe(404);
  });
});
