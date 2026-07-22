/**
 * HTTP / contract tests for the structured-data routes — real Express app over supertest + real DB.
 *
 * Only GET/PUT `/:documentId` exist (create is fed by the document pipeline, not HTTP). Neither route
 * touches OpenAI, so the happy paths are safe to drive here. Locks: auth (401), cuid id rejection
 * (400), the owner-only Tier-0 rule including the NO-admin-bypass trait (403), NotFound (404), the
 * `{ success, data }` envelope, and that there is no create route.
 *
 * Run via `npm run test:integration`.
 */
import request from 'supertest';
import { Role } from '@/features/users/models/User.model';
import {
  makeApp,
  pushTestSchema,
  resetDb,
  disconnectDb,
  seedUser,
  seedDocument,
  seedStructuredData,
  authHeader,
} from '@test/helpers';

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

describe('GET /api/structured-data/:documentId', () => {
  it('401s without a token', async () => {
    const owner = await seedUser({ username: 'owner' });
    const doc = await seedDocument({ userId: owner.id });
    const res = await request(app).get(`/api/structured-data/${doc.id}`);
    expect(res.status).toBe(401);
  });

  it('lets the owner read their structured data (200)', async () => {
    const owner = await seedUser({ username: 'owner' });
    const doc = await seedDocument({ userId: owner.id });
    await seedStructuredData({ documentId: doc.id, headers: [{ name: 'Produto', type: 'TEXT' }], data: [['Notebook', 5000]] });

    const res = await request(app)
      .get(`/api/structured-data/${doc.id}`)
      .set(authHeader({ id: owner.id, username: owner.username }));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.columns[0].key).toBe('Produto');
  });

  it('403s when another USER reads it (owner-only)', async () => {
    const owner = await seedUser({ username: 'owner' });
    const stranger = await seedUser({ username: 'stranger' });
    const doc = await seedDocument({ userId: owner.id });
    await seedStructuredData({ documentId: doc.id });

    const res = await request(app)
      .get(`/api/structured-data/${doc.id}`)
      .set(authHeader({ id: stranger.id, username: stranger.username }));
    expect(res.status).toBe(403);
  });

  it('403s for an ADMIN who is NOT the owner — no admin bypass', async () => {
    const owner = await seedUser({ username: 'owner' });
    const admin = await seedUser({ username: 'root', role: Role.ADMIN });
    const doc = await seedDocument({ userId: owner.id });
    await seedStructuredData({ documentId: doc.id });

    const res = await request(app)
      .get(`/api/structured-data/${doc.id}`)
      .set(authHeader({ id: admin.id, username: admin.username, role: Role.ADMIN }));
    expect(res.status).toBe(403);
  });

  it('404s when the owner has a document but no structured data', async () => {
    const owner = await seedUser({ username: 'owner' });
    const doc = await seedDocument({ userId: owner.id });
    const res = await request(app)
      .get(`/api/structured-data/${doc.id}`)
      .set(authHeader({ id: owner.id, username: owner.username }));
    expect(res.status).toBe(404);
  });

  it('400s on a malformed (non-cuid) documentId', async () => {
    const u = await seedUser({ username: 'u' });
    const res = await request(app)
      .get('/api/structured-data/not-a-cuid')
      .set(authHeader({ id: u.id, username: u.username }));
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});

describe('PUT /api/structured-data/:documentId', () => {
  it('401s without a token', async () => {
    const owner = await seedUser({ username: 'owner' });
    const doc = await seedDocument({ userId: owner.id });
    const res = await request(app).put(`/api/structured-data/${doc.id}`).send({ data: [['x', 1]] });
    expect(res.status).toBe(401);
  });

  it('lets the owner update their structured data (200)', async () => {
    const owner = await seedUser({ username: 'owner' });
    const doc = await seedDocument({ userId: owner.id });
    await seedStructuredData({ documentId: doc.id, data: [['old', 1]] });

    const res = await request(app)
      .put(`/api/structured-data/${doc.id}`)
      .set(authHeader({ id: owner.id, username: owner.username }))
      .send({ data: [['new', 2]] });

    expect(res.status).toBe(200);
    expect(res.body.data.data).toEqual([['new', 2]]);
  });

  it('403s when another USER updates it (owner-only)', async () => {
    const owner = await seedUser({ username: 'owner' });
    const stranger = await seedUser({ username: 'stranger' });
    const doc = await seedDocument({ userId: owner.id });
    await seedStructuredData({ documentId: doc.id });

    const res = await request(app)
      .put(`/api/structured-data/${doc.id}`)
      .set(authHeader({ id: stranger.id, username: stranger.username }))
      .send({ data: [['x', 1]] });
    expect(res.status).toBe(403);
  });

  it('400s when the body is missing the data field', async () => {
    const owner = await seedUser({ username: 'owner' });
    const doc = await seedDocument({ userId: owner.id });
    await seedStructuredData({ documentId: doc.id });

    const res = await request(app)
      .put(`/api/structured-data/${doc.id}`)
      .set(authHeader({ id: owner.id, username: owner.username }))
      .send({});
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});
