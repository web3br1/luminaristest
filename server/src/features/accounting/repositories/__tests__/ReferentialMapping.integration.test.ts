/**
 * Integration test: referential mappings (referential_mappings) against a REAL SQLite database
 * — BE-INCR-9 / ADR-INCR9. No mocks. Proves the SCHEMA-LEVEL guarantees a mocked unit test
 * cannot:
 *  - versioning coexistence: the same account maps in v2025 AND v2026 (D2, @@unique includes version);
 *  - @@unique collision: a second row for the same (scope, account, version) → P2002 (D2 concurrency);
 *  - idempotent upsert: re-set update-in-place (one row, refreshed code) (D2);
 *  - hard-delete then re-set: no tombstone → no P2002 on re-map (D5 — the reason there is no deletedAt);
 *  - cascade on User delete (D7): mappings are regenerable state, NOT the audit trail — they go with the user;
 *  - cross-unit isolation (tenancy).
 *
 * Mirrors the dedicated-client harness of SourceProvenance.integration.test.ts. FK enforcement ON.
 */
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { execSync } from 'child_process';
import { PrismaClient } from 'generated/prisma';

const SERVER_ROOT = path.join(__dirname, '../../../../../');

const USER_ID = 'u-ref';
const UNIT = 'unit-ref';
const UNIT_OTHER = 'unit-ref-other';

/** The exact upsert the repository issues (update refreshes code/label, keeps identity). */
async function upsert(
  db: PrismaClient,
  args: { userId: string; unitId: string; accountId: string; referentialCode: string; label: string; mappingVersion: string },
) {
  return db.referentialMapping.upsert({
    where: {
      userId_unitId_accountId_mappingVersion: {
        userId: args.userId,
        unitId: args.unitId,
        accountId: args.accountId,
        mappingVersion: args.mappingVersion,
      },
    },
    update: { referentialCode: args.referentialCode, label: args.label },
    create: args,
  });
}

describe('ReferentialMapping — real SQLite DB (BE-INCR-9)', () => {
  let db: PrismaClient;
  let dbPath: string;

  beforeAll(async () => {
    dbPath = path.join(os.tmpdir(), `incr9-ref-${Date.now()}.db`);
    execSync('npx prisma migrate deploy', {
      cwd: SERVER_ROOT,
      env: { ...process.env, DATABASE_URL: `file:${dbPath}` },
      stdio: 'pipe',
    });
    db = new PrismaClient({ datasources: { db: { url: `file:${dbPath}?connection_limit=1` } } });
    await db.$connect();
    await db.$queryRawUnsafe('PRAGMA foreign_keys = ON');

    await db.user.create({
      data: { id: USER_ID, name: 'Ref User', username: 'refuser', email: 'ref@test.local', password: 'x', role: 'USER' },
    });
    // One leaf account, referenced by all mapping rows below.
    await db.account.create({
      data: { id: 'acc-cash', userId: USER_ID, unitId: UNIT, code: '1.1.1', name: 'Caixa', nature: 'Asset', acceptsEntries: true },
    });
  }, 60000);

  afterAll(async () => {
    await db.$disconnect();
    for (const suffix of ['', '-wal', '-shm']) {
      try { fs.unlinkSync(dbPath + suffix); } catch {}
    }
  });

  it('versioning coexistence (D2): the same account maps in v2025 AND v2026 without colliding', async () => {
    const m2025 = await upsert(db, {
      userId: USER_ID, unitId: UNIT, accountId: 'acc-cash', referentialCode: '1.01.01', label: 'Caixa 2025', mappingVersion: '2025',
    });
    const m2026 = await upsert(db, {
      userId: USER_ID, unitId: UNIT, accountId: 'acc-cash', referentialCode: '1.01.01.001', label: 'Caixa 2026', mappingVersion: '2026',
    });
    expect(m2025.id).not.toBe(m2026.id);

    const rows = await db.referentialMapping.findMany({
      where: { userId: USER_ID, unitId: UNIT, accountId: 'acc-cash' },
      orderBy: { mappingVersion: 'asc' },
    });
    expect(rows.map((r) => r.mappingVersion)).toEqual(['2025', '2026']);
  });

  it('@@unique collision (D2): a second CREATE of the same (scope, account, version) → P2002', async () => {
    await expect(
      db.referentialMapping.create({
        data: { userId: USER_ID, unitId: UNIT, accountId: 'acc-cash', referentialCode: 'dup', label: 'dup', mappingVersion: '2025' },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });

  it('idempotent upsert (D2): re-set is update-in-place — one row, code refreshed', async () => {
    await upsert(db, {
      userId: USER_ID, unitId: UNIT, accountId: 'acc-cash', referentialCode: '1.01.01.NEW', label: 'Caixa v2', mappingVersion: '2025',
    });
    const rows = await db.referentialMapping.findMany({
      where: { userId: USER_ID, unitId: UNIT, accountId: 'acc-cash', mappingVersion: '2025' },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].referentialCode).toBe('1.01.01.NEW');
  });

  it('hard-delete then re-set (D5): no tombstone → re-map the same pair succeeds (no P2002)', async () => {
    await db.referentialMapping.deleteMany({
      where: { userId: USER_ID, unitId: UNIT, accountId: 'acc-cash', mappingVersion: '2026' },
    });
    // If there were a soft-delete tombstone under the @@unique, this would throw P2002.
    const remapped = await upsert(db, {
      userId: USER_ID, unitId: UNIT, accountId: 'acc-cash', referentialCode: '1.01.01.RE', label: 'Caixa re', mappingVersion: '2026',
    });
    expect(remapped.referentialCode).toBe('1.01.01.RE');
  });

  it('cross-unit isolation: a mapping in another unit is invisible to this unit', async () => {
    await db.account.create({
      data: { id: 'acc-cash-other', userId: USER_ID, unitId: UNIT_OTHER, code: '1.1.1', name: 'Caixa', nature: 'Asset', acceptsEntries: true },
    });
    await upsert(db, {
      userId: USER_ID, unitId: UNIT_OTHER, accountId: 'acc-cash-other', referentialCode: 'X', label: 'X', mappingVersion: '2025',
    });
    const thisUnit = await db.referentialMapping.findMany({ where: { userId: USER_ID, unitId: UNIT } });
    expect(thisUnit.every((r) => r.unitId === UNIT)).toBe(true);
  });

  it('cascade on User delete (D7): mappings are regenerable state and go with the user (trail lives in AuditEvent)', async () => {
    const doomed = 'u-ref-doomed';
    await db.user.create({
      data: { id: doomed, name: 'Doomed', username: 'refdoomed', email: 'refdoomed@test.local', password: 'x', role: 'USER' },
    });
    await db.account.create({
      data: { id: 'acc-doomed', userId: doomed, unitId: 'unit-doomed', code: '1.1.1', name: 'Caixa', nature: 'Asset', acceptsEntries: true },
    });
    await upsert(db, {
      userId: doomed, unitId: 'unit-doomed', accountId: 'acc-doomed', referentialCode: 'Z', label: 'Z', mappingVersion: '2025',
    });

    await db.user.delete({ where: { id: doomed } });

    const survivors = await db.referentialMapping.findMany({ where: { userId: doomed } });
    expect(survivors).toHaveLength(0);
  });
});
