/**
 * HTTP / contract tests for the dynamic-tables routes — real Express app over supertest + real DB.
 *
 * Tables have NO public create route (structure is system-managed), so fixtures are seeded directly
 * via `seedDynamicTable`/`seedDynamicTableData`. Locks: auth (401), cuid id rejection (400), the
 * Tier-0 cross-tenant rule on every data route (403/404), the `{ success, data }` envelope, the
 * additive pagination shape, and the `/lookup` cross-tenant regression guard (a caller must not be
 * able to resolve labels for another tenant's record ids via their own authorized tableId).
 *
 * Run via `npm run test:integration`.
 */
import request from 'supertest';
import {
  makeApp,
  pushTestSchema,
  resetDb,
  disconnectDb,
  seedUser,
  seedDynamicTable,
  seedDynamicTableData,
  authHeader,
} from '@test/helpers';

const app = makeApp();

const TITLE_SCHEMA = {
  fields: [{ name: 'title', label: 'Title', type: 'string', required: true }],
};

beforeAll(() => {
  pushTestSchema();
}, 120000);

afterEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await disconnectDb();
});

describe('GET /api/dynamic-tables', () => {
  it('401s without a token', async () => {
    const res = await request(app).get('/api/dynamic-tables');
    expect(res.status).toBe(401);
  });

  it('lists only the caller\'s tables in the { success, data } envelope', async () => {
    const owner = await seedUser({ username: 'owner' });
    const other = await seedUser({ username: 'other' });
    await seedDynamicTable({ userId: owner.id, name: 'Mine', schema: TITLE_SCHEMA });
    await seedDynamicTable({ userId: other.id, name: 'Theirs', schema: TITLE_SCHEMA });

    const res = await request(app)
      .get('/api/dynamic-tables')
      .set(authHeader({ id: owner.id, username: owner.username }));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].name).toBe('Mine');
  });
});

describe('GET /api/dynamic-tables/:tableId', () => {
  it('400s on a non-cuid tableId', async () => {
    const owner = await seedUser({ username: 'owner' });
    const res = await request(app)
      .get('/api/dynamic-tables/not-a-cuid')
      .set(authHeader({ id: owner.id, username: owner.username }));
    expect(res.status).toBe(400);
  });

  it('lets the owner read their table (200)', async () => {
    const owner = await seedUser({ username: 'owner' });
    const t = await seedDynamicTable({ userId: owner.id, schema: TITLE_SCHEMA });
    const res = await request(app)
      .get(`/api/dynamic-tables/${t.id}`)
      .set(authHeader({ id: owner.id, username: owner.username }));
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(t.id);
  });

  it('403s when another USER reads the table (Tier-0)', async () => {
    const owner = await seedUser({ username: 'owner' });
    const stranger = await seedUser({ username: 'stranger' });
    const t = await seedDynamicTable({ userId: owner.id, schema: TITLE_SCHEMA });
    const res = await request(app)
      .get(`/api/dynamic-tables/${t.id}`)
      .set(authHeader({ id: stranger.id, username: stranger.username }));
    expect(res.status).toBe(403);
  });
});

describe('GET /api/dynamic-tables/:tableId/data', () => {
  it('returns rows for the owner (legacy non-paginated shape)', async () => {
    const owner = await seedUser({ username: 'owner' });
    const t = await seedDynamicTable({ userId: owner.id, schema: TITLE_SCHEMA });
    await seedDynamicTableData({ dynamicTableId: t.id, data: { title: 'A' } });
    await seedDynamicTableData({ dynamicTableId: t.id, data: { title: 'B' } });

    const res = await request(app)
      .get(`/api/dynamic-tables/${t.id}/data`)
      .set(authHeader({ id: owner.id, username: owner.username }));

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(2);
    expect(res.body).not.toHaveProperty('page');
  });

  it('returns the additive paginated shape when page/pageSize are given', async () => {
    const owner = await seedUser({ username: 'owner' });
    const t = await seedDynamicTable({ userId: owner.id, schema: TITLE_SCHEMA });
    await seedDynamicTableData({ dynamicTableId: t.id, data: { title: 'A' } });
    await seedDynamicTableData({ dynamicTableId: t.id, data: { title: 'B' } });
    await seedDynamicTableData({ dynamicTableId: t.id, data: { title: 'C' } });

    const res = await request(app)
      .get(`/api/dynamic-tables/${t.id}/data?page=1&pageSize=2`)
      .set(authHeader({ id: owner.id, username: owner.username }));

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.total).toBe(3);
    expect(res.body.page).toBe(1);
    expect(res.body.pageSize).toBe(2);
  });

  it('403s when another USER reads the data (Tier-0)', async () => {
    const owner = await seedUser({ username: 'owner' });
    const stranger = await seedUser({ username: 'stranger' });
    const t = await seedDynamicTable({ userId: owner.id, schema: TITLE_SCHEMA });
    const res = await request(app)
      .get(`/api/dynamic-tables/${t.id}/data`)
      .set(authHeader({ id: stranger.id, username: stranger.username }));
    expect(res.status).toBe(403);
  });
});

describe('POST /api/dynamic-tables/:tableId/data', () => {
  it('creates a row validated against the schema (201)', async () => {
    const owner = await seedUser({ username: 'owner' });
    const t = await seedDynamicTable({ userId: owner.id, schema: TITLE_SCHEMA });
    const res = await request(app)
      .post(`/api/dynamic-tables/${t.id}/data`)
      .set(authHeader({ id: owner.id, username: owner.username }))
      .send({ data: { title: 'Hello' } });
    expect(res.status).toBe(201);
    expect(res.body.data.data.title).toBe('Hello');
  });

  it('400s when the payload violates the dynamic schema (missing required field)', async () => {
    const owner = await seedUser({ username: 'owner' });
    const t = await seedDynamicTable({ userId: owner.id, schema: TITLE_SCHEMA });
    const res = await request(app)
      .post(`/api/dynamic-tables/${t.id}/data`)
      .set(authHeader({ id: owner.id, username: owner.username }))
      .send({ data: {} });
    expect(res.status).toBe(400);
  });

  it('403s when another USER writes to the table (Tier-0)', async () => {
    const owner = await seedUser({ username: 'owner' });
    const stranger = await seedUser({ username: 'stranger' });
    const t = await seedDynamicTable({ userId: owner.id, schema: TITLE_SCHEMA });
    const res = await request(app)
      .post(`/api/dynamic-tables/${t.id}/data`)
      .set(authHeader({ id: stranger.id, username: stranger.username }))
      .send({ data: { title: 'Hacked' } });
    expect(res.status).toBe(403);
  });
});

describe('PUT/DELETE /api/dynamic-tables/:tableId/data/:dataId (Tier-0)', () => {
  it('403s when another USER updates a row', async () => {
    const owner = await seedUser({ username: 'owner' });
    const stranger = await seedUser({ username: 'stranger' });
    const t = await seedDynamicTable({ userId: owner.id, schema: TITLE_SCHEMA });
    const row = await seedDynamicTableData({ dynamicTableId: t.id, data: { title: 'A' } });
    const res = await request(app)
      .put(`/api/dynamic-tables/${t.id}/data/${row.id}`)
      .set(authHeader({ id: stranger.id, username: stranger.username }))
      .send({ data: { title: 'Hacked' } });
    expect(res.status).toBe(403);
  });

  it('lets the owner soft-delete their row (204)', async () => {
    const owner = await seedUser({ username: 'owner' });
    const t = await seedDynamicTable({ userId: owner.id, schema: TITLE_SCHEMA });
    const row = await seedDynamicTableData({ dynamicTableId: t.id, data: { title: 'A' } });
    const res = await request(app)
      .delete(`/api/dynamic-tables/${t.id}/data/${row.id}`)
      .set(authHeader({ id: owner.id, username: owner.username }));
    expect(res.status).toBe(204);
  });
});

describe('POST /api/dynamic-tables/lookup — cross-tenant regression (T0.1)', () => {
  it('does not resolve labels for another tenant\'s record ids via the caller\'s own tableId', async () => {
    const owner = await seedUser({ username: 'owner' });
    const stranger = await seedUser({ username: 'stranger' });

    // Owner has a row with a sensitive display value.
    const ownerTable = await seedDynamicTable({ userId: owner.id, name: 'Owner', schema: TITLE_SCHEMA });
    const ownerRow = await seedDynamicTableData({
      dynamicTableId: ownerTable.id,
      data: { title: 'SECRET-CUSTOMER-NAME' },
    });

    // Stranger owns their own (authorized) table but passes the OWNER's recordId.
    const strangerTable = await seedDynamicTable({ userId: stranger.id, name: 'Stranger', schema: TITLE_SCHEMA });

    const res = await request(app)
      .post('/api/dynamic-tables/lookup')
      .set(authHeader({ id: stranger.id, username: stranger.username }))
      .send({ lookups: [{ tableId: strangerTable.id, recordIds: [ownerRow.id] }] });

    expect(res.status).toBe(200);
    // The foreign row must NOT be resolved — filtered out because it belongs to another table.
    const resolved = res.body.data?.[strangerTable.id] ?? {};
    expect(resolved[ownerRow.id]).toBeUndefined();
    expect(JSON.stringify(res.body)).not.toContain('SECRET-CUSTOMER-NAME');
  });

  it('resolves labels for the caller\'s own records', async () => {
    const owner = await seedUser({ username: 'owner' });
    const t = await seedDynamicTable({ userId: owner.id, schema: TITLE_SCHEMA });
    const row = await seedDynamicTableData({ dynamicTableId: t.id, data: { title: 'My Label' } });

    const res = await request(app)
      .post('/api/dynamic-tables/lookup')
      .set(authHeader({ id: owner.id, username: owner.username }))
      .send({ lookups: [{ tableId: t.id, recordIds: [row.id], displayField: 'title' }] });

    expect(res.status).toBe(200);
    expect(res.body.data[t.id][row.id]).toBe('My Label');
  });
});
