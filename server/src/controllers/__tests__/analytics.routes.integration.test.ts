/**
 * HTTP / contract tests for the analytics routes — real Express app over supertest + real DB.
 *
 * Scope note: resolving a chart/KPI requires seeded dynamic-table data and exercises the engine
 * (covered by the engine/processor specs). These tests lock the contract BOUNDARY: authentication
 * (401) and query-DTO validation (400). The one safe 200 is the drill-down early-return for an empty
 * recordIds set (it answers before touching any table data).
 *
 * Run via `npm run test:integration`.
 */
import request from 'supertest';
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

describe('GET /api/analytics/data', () => {
  it('401s without a token', async () => {
    const res = await request(app).get('/api/analytics/data?key=revenue');
    expect(res.status).toBe(401);
  });

  it('400s when the required key is missing', async () => {
    const u = await seedUser({ username: 'u' });
    const res = await request(app).get('/api/analytics/data').set(authHeader({ id: u.id, username: u.username }));
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});

describe('GET /api/analytics/drill-down', () => {
  it('401s without a token', async () => {
    const res = await request(app).get('/api/analytics/drill-down?tableId=t1');
    expect(res.status).toBe(401);
  });

  it('400s when tableId is missing', async () => {
    const u = await seedUser({ username: 'u' });
    const res = await request(app).get('/api/analytics/drill-down').set(authHeader({ id: u.id, username: u.username }));
    expect(res.status).toBe(400);
  });

  it('200s with an empty result when no recordIds are given (early return, no table access)', async () => {
    const u = await seedUser({ username: 'u' });
    const res = await request(app)
      .get('/api/analytics/drill-down?tableId=t1')
      .set(authHeader({ id: u.id, username: u.username }));
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toEqual([]);
  });
});
