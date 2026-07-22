/**
 * HTTP / contract tests for the authentication endpoints (register / login / me).
 * Drives the real app over supertest + real DB. Locks the auth flow now that authController delegates
 * to UserService (validation, hashing, uniqueness) instead of touching Prisma directly.
 *
 * Response contract (consumed by the frontend): { success, data: { user, token } }.
 */
import request from 'supertest';
import { makeApp, pushTestSchema, resetDb, disconnectDb, authHeader, seedUser } from '@test/helpers';
import { Role } from '@/features/users/models/User.model';

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

const VALID = { username: 'alice', email: 'alice@test.co', password: 'Passw0rd' };

describe('POST /api/auth/register', () => {
  it('201s with { user, token } and never returns the password', async () => {
    const res = await request(app).post('/api/auth/register').send(VALID);
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user.username).toBe('alice');
    expect(res.body.data.user).not.toHaveProperty('password');
    expect(typeof res.body.data.token).toBe('string');
  });

  it('400s on a weak password (shared DTO with POST /api/users)', async () => {
    const res = await request(app).post('/api/auth/register').send({ ...VALID, password: '123' });
    expect(res.status).toBe(400);
  });

  it('409s on a duplicate username', async () => {
    await seedUser({ username: 'alice', email: 'other@test.co' });
    const res = await request(app).post('/api/auth/register').send(VALID);
    expect(res.status).toBe(409);
  });
});

describe('POST /api/auth/login', () => {
  async function registerAlice() {
    await request(app).post('/api/auth/register').send(VALID);
  }

  it('200s with { user, token } for valid credentials (by identifier)', async () => {
    await registerAlice();
    const res = await request(app).post('/api/auth/login').send({ identifier: 'alice', password: 'Passw0rd' });
    expect(res.status).toBe(200);
    expect(res.body.data.user.username).toBe('alice');
    expect(typeof res.body.data.token).toBe('string');
    expect(res.body.data.user).not.toHaveProperty('password');
  });

  it('also logs in by email', async () => {
    await registerAlice();
    const res = await request(app).post('/api/auth/login').send({ identifier: 'alice@test.co', password: 'Passw0rd' });
    expect(res.status).toBe(200);
  });

  it('401s on a wrong password', async () => {
    await registerAlice();
    const res = await request(app).post('/api/auth/login').send({ identifier: 'alice', password: 'WrongPass1' });
    expect(res.status).toBe(401);
  });

  it('401s on an unknown user (no enumeration)', async () => {
    const res = await request(app).post('/api/auth/login').send({ identifier: 'ghost', password: 'whatever' });
    expect(res.status).toBe(401);
  });

  it('400s when no identifier/password is provided', async () => {
    const res = await request(app).post('/api/auth/login').send({ password: 'Passw0rd' });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/auth/me', () => {
  it('401s without a token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('returns the caller own profile (200, no password)', async () => {
    const u = await seedUser({ username: 'self', role: Role.USER });
    const res = await request(app)
      .get('/api/auth/me')
      .set(authHeader({ id: u.id, username: u.username, role: Role.USER }));
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(u.id);
    expect(res.body.data).not.toHaveProperty('password');
  });
});
