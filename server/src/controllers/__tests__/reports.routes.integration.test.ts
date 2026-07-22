/**
 * HTTP / contract tests for POST /api/reports/generate-chart-data — real app over supertest + real DB.
 *
 * Scope note: a valid request opens an SSE stream and calls OpenAI, which we don't exercise here
 * (generation is covered by the faked ReportService.spec). These tests lock the **SSE-safety
 * boundary** that runs BEFORE the stream is opened: authentication (401) and DTO validation (400) must
 * return a normal JSON error response — never a 200 + in-stream error event. This is the regression
 * guard for the "errors leaked into the stream" class of bug.
 */
import request from 'supertest';
import { makeApp, pushTestSchema, resetDb, disconnectDb, seedUser, authHeader } from '@test/helpers';

const app = makeApp();
const CUID = 'cl00000000000000000000000';

beforeAll(() => {
  pushTestSchema();
}, 120000);

afterEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await disconnectDb();
});

describe('POST /api/reports/generate-chart-data (pre-stream boundary)', () => {
  it('401s without a token (before any stream is opened)', async () => {
    const res = await request(app).post('/api/reports/generate-chart-data').send({ query: 'q', chatInstanceId: CUID });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED'); // fail-closed authMiddleware, before the controller
  });

  it('400s on an invalid body — a real JSON 400, not a 200 + SSE error event', async () => {
    const u = await seedUser({ username: 'u' });
    const res = await request(app)
      .post('/api/reports/generate-chart-data')
      .set(authHeader({ id: u.id, username: u.username }))
      .send({ query: '' }); // empty query + missing chatInstanceId
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.headers['content-type']).not.toMatch(/event-stream/);
  });

  it('400s when chatInstanceId is not a cuid', async () => {
    const u = await seedUser({ username: 'u' });
    const res = await request(app)
      .post('/api/reports/generate-chart-data')
      .set(authHeader({ id: u.id, username: u.username }))
      .send({ query: 'valid', chatInstanceId: 'not-a-cuid' });
    expect(res.status).toBe(400);
  });
});
