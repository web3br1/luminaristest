/**
 * HTTP / contract tests for the users routes — drives the REAL Express app (createApp) over
 * supertest against the REAL SQLite test DB. Covers the full route surface and what the service
 * layer can't see on its own: authMiddleware gates (401/403), DTO rejection (400), the success
 * envelope, handleApiError → status mapping, and secret (password) leakage.
 *
 * Authorization model: the middleware only authenticates + injects context; ALL per-record authz
 * is decided by UserService/UserPolicy. So: list = admin-only (canListAll); view/update a profile =
 * owner-or-admin (canView/canUpdate); delete = admin-only (canDelete — a User cascade-deletes its
 * business data, so self-delete is intentionally disallowed). A USER reads/edits their own profile
 * here or via GET /api/auth/me.
 *
 * Run via `npm run test:integration`.
 */
import request from 'supertest';
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

describe('GET /api/users (admin-only list)', () => {
  it('401s without a token', async () => {
    const res = await request(app).get('/api/users');
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('UNAUTHORIZED');
  });

  it('403s for a regular USER (canListAll policy)', async () => {
    const u = await seedUser({ username: 'bob', role: Role.USER });
    const res = await request(app)
      .get('/api/users')
      .set(authHeader({ id: u.id, username: u.username, role: Role.USER }));
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('200s for an ADMIN and never leaks password hashes', async () => {
    const adminUser = await seedUser({ username: 'root', role: Role.ADMIN });
    await seedUser({ username: 'carol', role: Role.USER });

    const res = await request(app)
      .get('/api/users')
      .set(authHeader({ id: adminUser.id, username: adminUser.username, role: Role.ADMIN }));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBeGreaterThanOrEqual(2);
    for (const row of res.body.data) {
      expect(row).not.toHaveProperty('password');
    }
  });
});

describe('GET /api/users/:id', () => {
  it('401s without a token', async () => {
    const u = await seedUser({ username: 'target' });
    const res = await request(app).get(`/api/users/${u.id}`);
    expect(res.status).toBe(401);
  });

  it('403s a USER on GET /api/users/:id even for their own id (admin-only surface; self-profile is /api/auth/me)', async () => {
    // Divergence from the fork kept ON PURPOSE: authMiddleware marks GET /api/users(/*) admin-only
    // (deny-by-default hardening, RISK-SEC-AUTH-001). A USER reads their own profile via /api/auth/me.
    const u = await seedUser({ username: 'self', role: Role.USER });
    const res = await request(app)
      .get(`/api/users/${u.id}`)
      .set(authHeader({ id: u.id, username: u.username, role: Role.USER }));
    expect(res.status).toBe(403);
  });

  it('403s when a USER views ANOTHER user (cross-tenant)', async () => {
    const me = await seedUser({ username: 'me', role: Role.USER });
    const other = await seedUser({ username: 'other' });
    const res = await request(app)
      .get(`/api/users/${other.id}`)
      .set(authHeader({ id: me.id, username: me.username, role: Role.USER }));
    expect(res.status).toBe(403);
  });

  it('200s for an ADMIN', async () => {
    const admin = await seedUser({ username: 'root', role: Role.ADMIN });
    const target = await seedUser({ username: 'target' });
    const res = await request(app)
      .get(`/api/users/${target.id}`)
      .set(authHeader({ id: admin.id, username: admin.username, role: Role.ADMIN }));
    expect(res.status).toBe(200);
    expect(res.body.data.username).toBe('target');
    expect(res.body.data).not.toHaveProperty('password');
  });

  it('400s on a malformed (non-cuid) id', async () => {
    const admin = await seedUser({ username: 'root', role: Role.ADMIN });
    const res = await request(app)
      .get('/api/users/not-a-cuid')
      .set(authHeader({ id: admin.id, username: admin.username, role: Role.ADMIN }));
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});

describe('POST /api/users (public signup)', () => {
  it('201s on valid input and does not return the password', async () => {
    const res = await request(app).post('/api/users').send({
      username: 'alice',
      email: 'alice@test.co',
      password: 'Passw0rd',
    });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.username).toBe('alice');
    expect(res.body.data).not.toHaveProperty('password');
  });

  it('400s when the DTO rejects the body (weak password)', async () => {
    const res = await request(app).post('/api/users').send({
      username: 'weakpw',
      email: 'weak@test.co',
      password: '123', // fails min length + complexity regex
    });
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('409s on a duplicate username', async () => {
    await seedUser({ username: 'dupe', email: 'first@test.co' });
    const res = await request(app).post('/api/users').send({
      username: 'dupe',
      email: 'second@test.co',
      password: 'Passw0rd',
    });
    expect(res.status).toBe(409);
  });
});

describe('PUT /api/users/:id', () => {
  it('401s without a token', async () => {
    const u = await seedUser({ username: 'self' });
    const res = await request(app).put(`/api/users/${u.id}`).send({ name: 'New' });
    expect(res.status).toBe(401);
  });

  it('lets a USER update their OWN profile (200)', async () => {
    const u = await seedUser({ username: 'self', name: 'Old', role: Role.USER });
    const res = await request(app)
      .put(`/api/users/${u.id}`)
      .set(authHeader({ id: u.id, username: u.username, role: Role.USER }))
      .send({ name: 'New' });
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('New');
  });

  it('403s when a USER tries to update ANOTHER user (canUpdate policy)', async () => {
    const me = await seedUser({ username: 'me', role: Role.USER });
    const other = await seedUser({ username: 'other' });
    const res = await request(app)
      .put(`/api/users/${other.id}`)
      .set(authHeader({ id: me.id, username: me.username, role: Role.USER }))
      .send({ name: 'Hacked' });
    expect(res.status).toBe(403);
  });
});

describe('DELETE /api/users/:id (admin-only)', () => {
  it('401s without a token', async () => {
    const u = await seedUser({ username: 'victim' });
    const res = await request(app).delete(`/api/users/${u.id}`);
    expect(res.status).toBe(401);
  });

  it('403s for a USER deleting themselves (canDelete policy — admin-only)', async () => {
    const u = await seedUser({ username: 'self', role: Role.USER });
    const res = await request(app)
      .delete(`/api/users/${u.id}`)
      .set(authHeader({ id: u.id, username: u.username, role: Role.USER }));
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('FORBIDDEN');
  });

  it('200s when an ADMIN deletes a user', async () => {
    const admin = await seedUser({ username: 'root', role: Role.ADMIN });
    const victim = await seedUser({ username: 'victim' });
    const res = await request(app)
      .delete(`/api/users/${victim.id}`)
      .set(authHeader({ id: admin.id, username: admin.username, role: Role.ADMIN }));
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });
});

describe('PATCH /api/users/me/preferences', () => {
  it('401s without a token', async () => {
    const res = await request(app).patch('/api/users/me/preferences').send({ locale: 'pt' });
    expect(res.status).toBe(401);
  });

  it('updates the caller own preferences (200)', async () => {
    const u = await seedUser({ username: 'self', role: Role.USER });
    const res = await request(app)
      .patch('/api/users/me/preferences')
      .set(authHeader({ id: u.id, username: u.username, role: Role.USER }))
      .send({ locale: 'pt', currency: 'USD' });
    expect(res.status).toBe(200);
    expect(res.body.data.locale).toBe('pt');
    expect(res.body.data.currency).toBe('USD');
  });
});
