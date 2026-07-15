/**
 * Integration test: the maker-checker version CAS (ADR-INCR-APPROVAL, ACC-023) against a REAL
 * SQLite database. No mocks. Proves the two schema-level guarantees the mocked service test
 * cannot:
 *   1. Concurrency — of N concurrent approve CAS on one PendingApproval entry, exactly ONE
 *      gets count===1 (the optimistic lock `where version = expected` serializes them).
 *   2. Migration additivity — multiple Draft/PendingApproval rows with (fiscalYear, entryNumber)
 *      = (null, null) COEXIST under @@unique([userId,unitId,fiscalYear,entryNumber]) (SQLite
 *      treats NULL as distinct), so making the columns nullable did not break the constraint.
 *
 * Mirrors the dedicated-client harness of PayableClaim.integration.test.ts. FK enforcement ON.
 */
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { execSync } from 'child_process';
import { PrismaClient } from 'generated/prisma';

const SERVER_ROOT = path.join(__dirname, '../../../../../');
const USER_ID = 'u-appr';
const UNIT = 'unit-appr';

/** The exact approval CAS EntryApprovalService issues via journalEntryRepo.casUpdate. */
async function approveCas(db: PrismaClient, id: string, expectedVersion: number, entryNumber: number): Promise<number> {
  const r = await db.journalEntry.updateMany({
    where: { id, userId: USER_ID, unitId: UNIT, version: expectedVersion },
    data: { status: 'Posted', approvedById: 'checker', postedById: 'checker', fiscalYear: 2026, entryNumber, version: expectedVersion + 1 },
  });
  return r.count;
}

describe('JournalEntry approval CAS — real SQLite DB (ADR-INCR-APPROVAL)', () => {
  let db: PrismaClient;
  let dbPath: string;

  beforeAll(async () => {
    dbPath = path.join(os.tmpdir(), `appr-cas-${Date.now()}.db`);
    execSync('npx prisma migrate deploy', {
      cwd: SERVER_ROOT,
      env: { ...process.env, DATABASE_URL: `file:${dbPath}` },
      stdio: 'pipe',
    });
    db = new PrismaClient({
      datasources: { db: { url: `file:${dbPath}?socket_timeout=60&connection_limit=1` } },
    });
    await db.user.create({
      data: { id: USER_ID, name: 'Appr User', username: 'appruser', email: 'appr@test.local', password: 'x', role: 'USER' },
    });
  }, 60000);

  afterAll(async () => {
    await db.$disconnect();
    for (const suffix of ['', '-wal', '-shm']) {
      try { fs.unlinkSync(dbPath + suffix); } catch {}
    }
  });

  async function seedPending(id: string): Promise<void> {
    await db.journalEntry.create({
      data: {
        id, userId: USER_ID, unitId: UNIT, date: new Date('2026-06-10'), description: 'x',
        status: 'PendingApproval', sourceType: 'manual', createdById: 'maker', submittedById: 'maker',
        version: 2, contentHash: 'h', fiscalYear: null, entryNumber: null,
      },
    });
  }

  it('10 concurrent approve CAS on one PendingApproval entry → exactly one wins; row ends Posted', async () => {
    await seedPending('e-race');
    const counts = await Promise.all(Array.from({ length: 10 }, (_, i) => approveCas(db, 'e-race', 2, i + 1)));
    expect(counts.filter((c) => c === 1)).toHaveLength(1);
    expect(counts.filter((c) => c === 0)).toHaveLength(9);
    const row = await db.journalEntry.findUnique({ where: { id: 'e-race' } });
    expect(row?.status).toBe('Posted');
    expect(row?.version).toBe(3);
    expect(row?.entryNumber).not.toBeNull();
  }, 60000);

  it('a CAS with a stale expectedVersion returns 0 (no transition)', async () => {
    await seedPending('e-stale');
    await db.journalEntry.update({ where: { id: 'e-stale' }, data: { version: 5 } });
    expect(await approveCas(db, 'e-stale', 2, 1)).toBe(0);
  }, 30000);

  it('multiple Draft rows with (null fiscalYear, null entryNumber) coexist under @@unique (additive migration)', async () => {
    for (const id of ['d-1', 'd-2', 'd-3']) {
      await db.journalEntry.create({
        data: {
          id, userId: USER_ID, unitId: UNIT, date: new Date('2026-06-10'), description: 'draft',
          status: 'Draft', sourceType: 'manual', createdById: 'maker', version: 1,
          fiscalYear: null, entryNumber: null,
        },
      });
    }
    const drafts = await db.journalEntry.findMany({ where: { userId: USER_ID, unitId: UNIT, status: 'Draft' } });
    expect(drafts).toHaveLength(3); // no P2002 — NULLs are distinct under the unique index
  }, 30000);
});
