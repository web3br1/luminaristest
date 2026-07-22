/**
 * HTTP / contract tests for the documents routes — drives the REAL Express app (createApp) over
 * supertest against the REAL SQLite test DB.
 *
 * Scope note: upload/search/successful-delete call Qdrant + OpenAI, which we don't exercise here
 * (the delete ORDERING and search SCOPING are covered by DocumentService.integration with mocks).
 * These tests lock the contract BOUNDARY that runs BEFORE any external call: authentication (401),
 * id/DTO rejection (400), Tier-0 ownership (existence-non-leak 404 / Forbidden 403), and the
 * `{ success, data }` envelope. Every rejection path (delete of a foreign/missing doc) is decided by
 * the policy/SQL BEFORE Qdrant is touched, so it is safe to assert here.
 *
 * Run via `npm run test:integration`.
 */
import request from 'supertest';
import { Role } from '@/features/users/models/User.model';
import { makeApp, pushTestSchema, resetDb, disconnectDb, seedUser, seedDocument, authHeader } from '@test/helpers';

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

describe('GET /api/documents (list, scoped to the caller)', () => {
  it('401s without a token', async () => {
    const res = await request(app).get('/api/documents');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
  });

  it('200s and returns only the caller documents', async () => {
    const owner = await seedUser({ username: 'owner' });
    const other = await seedUser({ username: 'other' });
    await seedDocument({ userId: owner.id, fileName: 'a.pdf' });
    await seedDocument({ userId: other.id, fileName: 'foreign.pdf' });

    const res = await request(app)
      .get('/api/documents')
      .set(authHeader({ id: owner.id, username: owner.username }));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.totalCount).toBe(1);
    expect(res.body.data.documents[0].fileName).toBe('a.pdf');
  });
});

describe('GET /api/documents/:id', () => {
  it('401s without a token', async () => {
    const owner = await seedUser({ username: 'owner' });
    const doc = await seedDocument({ userId: owner.id });
    const res = await request(app).get(`/api/documents/${doc.id}`);
    expect(res.status).toBe(401);
  });

  it('lets the owner read their OWN document (200)', async () => {
    const owner = await seedUser({ username: 'owner' });
    const doc = await seedDocument({ userId: owner.id, fileName: 'mine.pdf' });
    const res = await request(app)
      .get(`/api/documents/${doc.id}`)
      .set(authHeader({ id: owner.id, username: owner.username }));
    expect(res.status).toBe(200);
    expect(res.body.data.fileName).toBe('mine.pdf');
  });

  it('404s (NOT 403) when a USER reads ANOTHER user document — existence is not leaked', async () => {
    const owner = await seedUser({ username: 'owner' });
    const stranger = await seedUser({ username: 'stranger' });
    const doc = await seedDocument({ userId: owner.id });
    const res = await request(app)
      .get(`/api/documents/${doc.id}`)
      .set(authHeader({ id: stranger.id, username: stranger.username }));
    expect(res.status).toBe(404);
  });

  it('200s for an ADMIN reading any document', async () => {
    const owner = await seedUser({ username: 'owner' });
    const admin = await seedUser({ username: 'root', role: Role.ADMIN });
    const doc = await seedDocument({ userId: owner.id, fileName: 'target.pdf' });
    const res = await request(app)
      .get(`/api/documents/${doc.id}`)
      .set(authHeader({ id: admin.id, username: admin.username, role: Role.ADMIN }));
    expect(res.status).toBe(200);
    expect(res.body.data.fileName).toBe('target.pdf');
  });

  it('400s on a malformed (non-cuid) id', async () => {
    const u = await seedUser({ username: 'u' });
    const res = await request(app)
      .get('/api/documents/not-a-cuid')
      .set(authHeader({ id: u.id, username: u.username }));
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});

describe('PATCH /api/documents/:id', () => {
  const validBody = { status: 'COMPLETED', summary: null, processingDate: null, processingError: null };

  it('401s without a token', async () => {
    const owner = await seedUser({ username: 'owner' });
    const doc = await seedDocument({ userId: owner.id });
    const res = await request(app).patch(`/api/documents/${doc.id}`).send(validBody);
    expect(res.status).toBe(401);
  });

  it('lets the owner update their document (200)', async () => {
    const owner = await seedUser({ username: 'owner' });
    const doc = await seedDocument({ userId: owner.id, status: 'PENDING' });
    const res = await request(app)
      .patch(`/api/documents/${doc.id}`)
      .set(authHeader({ id: owner.id, username: owner.username }))
      .send({ ...validBody, summary: 'done' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('COMPLETED');
    expect(res.body.data.summary).toBe('done');
  });

  it('403s when a USER updates ANOTHER user document', async () => {
    const owner = await seedUser({ username: 'owner' });
    const stranger = await seedUser({ username: 'stranger' });
    const doc = await seedDocument({ userId: owner.id });
    const res = await request(app)
      .patch(`/api/documents/${doc.id}`)
      .set(authHeader({ id: stranger.id, username: stranger.username }))
      .send(validBody);
    expect(res.status).toBe(403);
  });

  it('400s when the DTO rejects the body (missing required status)', async () => {
    const owner = await seedUser({ username: 'owner' });
    const doc = await seedDocument({ userId: owner.id });
    const res = await request(app)
      .patch(`/api/documents/${doc.id}`)
      .set(authHeader({ id: owner.id, username: owner.username }))
      .send({ summary: 'no status field' });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});

describe('DELETE /api/documents/:id (rejection paths — decided before Qdrant)', () => {
  it('401s without a token', async () => {
    const owner = await seedUser({ username: 'owner' });
    const doc = await seedDocument({ userId: owner.id });
    const res = await request(app).delete(`/api/documents/${doc.id}`);
    expect(res.status).toBe(401);
  });

  it('403s when a USER deletes ANOTHER user document (policy denies before Qdrant)', async () => {
    const owner = await seedUser({ username: 'owner' });
    const stranger = await seedUser({ username: 'stranger' });
    const doc = await seedDocument({ userId: owner.id });
    const res = await request(app)
      .delete(`/api/documents/${doc.id}`)
      .set(authHeader({ id: stranger.id, username: stranger.username }));
    expect(res.status).toBe(403);
  });

  it('404s when the document does not exist', async () => {
    const u = await seedUser({ username: 'u' });
    const res = await request(app)
      .delete('/api/documents/cl00000000000000000000000')
      .set(authHeader({ id: u.id, username: u.username }));
    expect(res.status).toBe(404);
  });
});
