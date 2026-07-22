/**
 * HTTP / contract tests for the dashboard-layout routes — real Express app over supertest + real DB.
 * Locks: auth (401), DTO/id rejection (400), Tier-0 ownership (403), NotFound (404), the
 * `{ success, data }` envelope, and the merge-on-update behavior end-to-end.
 *
 * Run via `npm run test:integration`.
 */
import request from 'supertest';
import { LayoutType } from '@/features/dashboardLayout/models/DashboardLayout.model';
import { makeApp, pushTestSchema, resetDb, disconnectDb, seedUser, seedDashboardLayout, authHeader } from '@test/helpers';

const app = makeApp();

const validBody = { name: 'My Tab', type: LayoutType.GRID, config: { columns: 2, widgets: [] } };

beforeAll(() => {
  pushTestSchema();
}, 120000);

afterEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await disconnectDb();
});

describe('GET /api/dashboard-layout', () => {
  it('401s without a token', async () => {
    const res = await request(app).get('/api/dashboard-layout');
    expect(res.status).toBe(401);
  });

  it('200s with only the caller layouts', async () => {
    const owner = await seedUser({ username: 'owner' });
    const other = await seedUser({ username: 'other' });
    await seedDashboardLayout({ userId: owner.id, name: 'Mine' });
    await seedDashboardLayout({ userId: other.id, name: 'Theirs' });

    const res = await request(app)
      .get('/api/dashboard-layout')
      .set(authHeader({ id: owner.id, username: owner.username }));
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].name).toBe('Mine');
  });
});

describe('POST /api/dashboard-layout', () => {
  it('401s without a token', async () => {
    const res = await request(app).post('/api/dashboard-layout').send(validBody);
    expect(res.status).toBe(401);
  });

  it('201s and the new layout is active', async () => {
    const u = await seedUser({ username: 'u' });
    const res = await request(app)
      .post('/api/dashboard-layout')
      .set(authHeader({ id: u.id, username: u.username }))
      .send(validBody);
    expect(res.status).toBe(201);
    expect(res.body.data.isActive).toBe(true);
  });

  it('400s on an invalid body (name too short)', async () => {
    const u = await seedUser({ username: 'u' });
    const res = await request(app)
      .post('/api/dashboard-layout')
      .set(authHeader({ id: u.id, username: u.username }))
      .send({ ...validBody, name: 'ab' });
    expect(res.status).toBe(400);
  });
});

describe('GET /api/dashboard-layout/:id', () => {
  it('lets the owner read it (200)', async () => {
    const u = await seedUser({ username: 'owner' });
    const l = await seedDashboardLayout({ userId: u.id, name: 'Mine' });
    const res = await request(app)
      .get(`/api/dashboard-layout/${l.id}`)
      .set(authHeader({ id: u.id, username: u.username }));
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Mine');
  });

  it('403s for another user', async () => {
    const owner = await seedUser({ username: 'owner' });
    const stranger = await seedUser({ username: 'stranger' });
    const l = await seedDashboardLayout({ userId: owner.id });
    const res = await request(app)
      .get(`/api/dashboard-layout/${l.id}`)
      .set(authHeader({ id: stranger.id, username: stranger.username }));
    expect(res.status).toBe(403);
  });

  it('404s for a missing layout', async () => {
    const u = await seedUser({ username: 'u' });
    const res = await request(app)
      .get('/api/dashboard-layout/cl00000000000000000000000')
      .set(authHeader({ id: u.id, username: u.username }));
    expect(res.status).toBe(404);
  });

  it('400s on a malformed (non-cuid) id', async () => {
    const u = await seedUser({ username: 'u' });
    const res = await request(app)
      .get('/api/dashboard-layout/not-a-cuid')
      .set(authHeader({ id: u.id, username: u.username }));
    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/dashboard-layout/:id (merge-on-update)', () => {
  it('a name-only PATCH keeps the stored type/config (200)', async () => {
    const u = await seedUser({ username: 'u' });
    const l = await seedDashboardLayout({ userId: u.id, name: 'Old', type: 'LIST', config: { columns: 4, widgets: ['w'] } });
    const res = await request(app)
      .patch(`/api/dashboard-layout/${l.id}`)
      .set(authHeader({ id: u.id, username: u.username }))
      .send({ name: 'Renamed' });
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBe('Renamed');
    expect(res.body.data.type).toBe('LIST');
    expect(res.body.data.config.columns).toBe(4);
  });

  it('403s when another user updates it', async () => {
    const owner = await seedUser({ username: 'owner' });
    const stranger = await seedUser({ username: 'stranger' });
    const l = await seedDashboardLayout({ userId: owner.id });
    const res = await request(app)
      .patch(`/api/dashboard-layout/${l.id}`)
      .set(authHeader({ id: stranger.id, username: stranger.username }))
      .send({ name: 'Hacked' });
    expect(res.status).toBe(403);
  });
});

describe('POST /api/dashboard-layout/:id/activate', () => {
  it('lets the owner activate a layout (200)', async () => {
    const u = await seedUser({ username: 'u' });
    const l = await seedDashboardLayout({ userId: u.id, isActive: false });
    const res = await request(app)
      .post(`/api/dashboard-layout/${l.id}/activate`)
      .set(authHeader({ id: u.id, username: u.username }));
    expect(res.status).toBe(200);
    expect(res.body.data.isActive).toBe(true);
  });
});

describe('DELETE /api/dashboard-layout/:id', () => {
  it('401s without a token', async () => {
    const u = await seedUser({ username: 'u' });
    const l = await seedDashboardLayout({ userId: u.id });
    const res = await request(app).delete(`/api/dashboard-layout/${l.id}`);
    expect(res.status).toBe(401);
  });

  it('200s when the owner deletes', async () => {
    const u = await seedUser({ username: 'u' });
    const l = await seedDashboardLayout({ userId: u.id });
    const res = await request(app)
      .delete(`/api/dashboard-layout/${l.id}`)
      .set(authHeader({ id: u.id, username: u.username }));
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('403s when another user deletes it', async () => {
    const owner = await seedUser({ username: 'owner' });
    const stranger = await seedUser({ username: 'stranger' });
    const l = await seedDashboardLayout({ userId: owner.id });
    const res = await request(app)
      .delete(`/api/dashboard-layout/${l.id}`)
      .set(authHeader({ id: stranger.id, username: stranger.username }));
    expect(res.status).toBe(403);
  });
});
