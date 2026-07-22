/**
 * Contract tests for the authMiddleware — locks the FAIL-CLOSED behavior: every /api route is
 * protected by default; only the explicit public allowlist is reachable without a token. This is
 * the test that guards against the most likely future mistake (a new route exposed by omission)
 * and against accidentally locking out a legitimately public endpoint.
 *
 * Drives the real app over supertest. No DB writes here, so no schema/reset needed.
 */
import request from 'supertest';
import { makeApp, disconnectDb } from '@test/helpers';

const app = makeApp();

afterAll(async () => {
  await disconnectDb(); // no-op if the app never opened a Prisma connection
});

describe('authMiddleware — fail-closed authentication', () => {
  it('passes through non-/api routes (e.g. GET /health) without a token', async () => {
    const res = await request(app).get('/health');
    // What this test guards is the auth passthrough (no 401). /health itself pings DB and Qdrant
    // (R19) and legitimately answers 503 (degraded) when Qdrant is absent, as in this test env.
    expect([200, 503]).toContain(res.status);
    expect(res.status).not.toBe(401);
  });

  it('protects an /api route by default — 401 without a token', async () => {
    const res = await request(app).get('/api/dynamic-tables');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
  });

  it('protection applies across features (another route is 401 too)', async () => {
    const res = await request(app).get('/api/dashboard-layout');
    expect(res.status).toBe(401);
  });

  it('keeps the public allowlist open: GET /api/docs/openapi.json is not auth-blocked', async () => {
    const res = await request(app).get('/api/docs/openapi.json');
    expect(res.status).not.toBe(401);
  });

  it('keeps public signup open: POST /api/users is not auth-blocked (DTO 400, not 401)', async () => {
    const res = await request(app).post('/api/users').send({});
    expect(res.status).not.toBe(401);
    expect(res.status).toBe(400);
  });
});
