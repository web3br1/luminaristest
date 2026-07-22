/**
 * Replay test: 20260627150000_add_entry_numbering against a POPULATED pre-INCR-3
 * database with Prisma-format dates (RISK-INCR3-MIGRATION-001).
 *
 * The 2026-06-27 synthetic gate passed because SQL-seeded fixtures store DateTime
 * as TEXT; real Prisma data stores INTEGER ms-epoch, which the original backfill
 * fed raw to strftime (interpreted as Julian Day) → NULL fiscalYear → P3018, and
 * the failed run left `journal_entries_new` behind, killing the retry.
 *
 * This test rebuilds that scenario with the real migration files:
 *   1. applies every migration BEFORE add_entry_numbering, in order;
 *   2. seeds journal_entries with INTEGER ms-epoch dates (Prisma format), TEXT
 *      dates (SQL-seeded format) and a partition mixing both;
 *   3. plants `journal_entries_new` + a stale sequences row, simulating the
 *      leftovers of a failed prior run;
 *   4. executes the real migration.sql.
 * It asserts fiscalYear under UTC semantics (ADR-INCR3 Emenda 3 — must match
 * PostingService.fiscalYearFrom), gapless chronological entryNumber per
 * partition, and sequence seeding.
 */
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { execSync } from 'child_process';
import { PrismaClient } from 'generated/prisma';

const SERVER_ROOT = path.join(__dirname, '../../../../../');
const MIGRATIONS_DIR = path.join(SERVER_ROOT, 'prisma', 'migrations');
const TARGET_MIGRATION = '20260627150000_add_entry_numbering';

// Prisma-format DateTime: INTEGER ms-epoch (what the app actually writes)
const ms = (iso: string) => Date.UTC(
  Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)),
);

function sqlUrl(dbPath: string): string {
  // Windows-style file URL (file:C:/...), never POSIX-style file:/c/...
  return `file:${dbPath.replace(/\\/g, '/')}`;
}

function dbExecute(dbPath: string, sqlFilePath: string): void {
  execSync(`npx prisma db execute --file "${sqlFilePath}" --url "${sqlUrl(dbPath)}"`, {
    cwd: SERVER_ROOT,
    stdio: 'pipe',
  });
}

describe('add_entry_numbering migration — replay on populated pre-INCR-3 DB', () => {
  let db: PrismaClient;
  let dbPath: string;
  let scratchDir: string;

  beforeAll(async () => {
    scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), 'incr3-replay-'));
    dbPath = path.join(scratchDir, 'replay.db');

    // 1. Pre-INCR-3 schema: every real migration strictly before the target, in order.
    const dirs = fs.readdirSync(MIGRATIONS_DIR)
      .filter((d) => fs.existsSync(path.join(MIGRATIONS_DIR, d, 'migration.sql')))
      .sort();
    const targetIdx = dirs.indexOf(TARGET_MIGRATION);
    expect(targetIdx).toBeGreaterThan(0);
    const combined = dirs.slice(0, targetIdx)
      .map((d) => fs.readFileSync(path.join(MIGRATIONS_DIR, d, 'migration.sql'), 'utf8'))
      .join('\n');
    const preSchemaFile = path.join(scratchDir, 'pre-incr3-schema.sql');
    fs.writeFileSync(preSchemaFile, combined);
    dbExecute(dbPath, preSchemaFile);

    // 2. Populated data in BOTH storage formats + failed-run leftovers.
    //    INTEGER rows mirror Prisma writes (typeof(date)='integer', ms-epoch);
    //    TEXT rows mirror SQL-seeded fixtures. u2/unitC mixes both in one
    //    fiscal-year partition: the TEXT row is chronologically FIRST but a raw
    //    ORDER BY "date" would sort the INTEGER row first (storage class < TEXT).
    const fixtureFile = path.join(scratchDir, 'fixture.sql');
    fs.writeFileSync(fixtureFile, `
INSERT INTO "User" ("id","username","email","password","updatedAt") VALUES
  ('u1','replay-u1','u1@replay.local','x','2025-01-01 00:00:00'),
  ('u2','replay-u2','u2@replay.local','x','2025-01-01 00:00:00');

INSERT INTO "journal_entries"
  ("id","userId","unitId","date","description","status","sourceType","sourceId",
   "reversedById","createdAt","updatedAt","createdById","postedById")
VALUES
  ('e1','u1','unitA',${ms('2025-03-15')},'int 2025 #1','Posted','manual',NULL,NULL,${ms('2025-03-15')},${ms('2025-03-15')},NULL,NULL),
  ('e2','u1','unitA',${ms('2025-07-01')},'int 2025 #2','Posted','manual',NULL,NULL,${ms('2025-07-01')},${ms('2025-07-01')},NULL,NULL),
  ('e3','u1','unitA',${ms('2025-12-31')},'int 2025 #3','Posted','manual',NULL,NULL,${ms('2025-12-31')},${ms('2025-12-31')},NULL,NULL),
  ('e4','u1','unitA',${ms('2026-01-01')},'UTC boundary','Posted','manual',NULL,NULL,${ms('2026-01-01')},${ms('2026-01-01')},NULL,NULL),
  ('e5','u1','unitA',${ms('2026-06-01')},'int 2026 #2','Posted','manual',NULL,NULL,${ms('2026-06-01')},${ms('2026-06-01')},NULL,NULL),
  ('t1','u1','unitB','2025-02-01 00:00:00','text 2025 #1','Posted','manual',NULL,NULL,'2025-02-01 00:00:00','2025-02-01 00:00:00',NULL,NULL),
  ('t2','u1','unitB','2025-05-05 00:00:00','text 2025 #2','Posted','manual',NULL,NULL,'2025-05-05 00:00:00','2025-05-05 00:00:00',NULL,NULL),
  ('m1','u2','unitC','2026-02-10 00:00:00','mixed text, earlier','Posted','manual',NULL,NULL,'2026-02-10 00:00:00','2026-02-10 00:00:00',NULL,NULL),
  ('m2','u2','unitC',${ms('2026-05-20')},'mixed int, later','Posted','manual',NULL,NULL,${ms('2026-05-20')},${ms('2026-05-20')},NULL,NULL);

-- Failed-run leftovers: the original migration died on INSERT (P3018) BEFORE
-- dropping journal_entries, leaving these behind. The fixed migration must
-- clear both and still succeed.
CREATE TABLE "journal_entries_new" ("id" TEXT NOT NULL PRIMARY KEY);
CREATE TABLE "journal_entry_sequences" (
    "userId" TEXT NOT NULL, "unitId" TEXT NOT NULL, "fiscalYear" INTEGER NOT NULL,
    "last" INTEGER NOT NULL DEFAULT 0, "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY ("userId","unitId","fiscalYear")
);
INSERT INTO "journal_entry_sequences" ("userId","unitId","fiscalYear","last") VALUES ('stale','stale',1999,42);
`);
    dbExecute(dbPath, fixtureFile);

    // 3. The real migration under test — this is the call that died with P3018
    //    (NULL fiscalYear) and then died again on CREATE TABLE, pre-fix.
    dbExecute(dbPath, path.join(MIGRATIONS_DIR, TARGET_MIGRATION, 'migration.sql'));

    db = new PrismaClient({ datasources: { db: { url: sqlUrl(dbPath) } } });
  }, 180000);

  afterAll(async () => {
    await db?.$disconnect();
    fs.rmSync(scratchDir, { recursive: true, force: true });
  });

  async function rows(): Promise<Array<{ id: string; fiscalYear: number; entryNumber: number }>> {
    const raw = await db.$queryRawUnsafe<Array<{ id: string; fiscalYear: unknown; entryNumber: unknown }>>(
      'SELECT "id", "fiscalYear", "entryNumber" FROM "journal_entries"',
    );
    return raw.map((r) => ({ id: r.id, fiscalYear: Number(r.fiscalYear), entryNumber: Number(r.entryNumber) }));
  }

  it('backfills fiscalYear from INTEGER ms-epoch dates (the P3018 class) and TEXT dates', async () => {
    const byId = new Map((await rows()).map((r) => [r.id, r]));
    expect(byId.size).toBe(9); // all rows survived the rebuild
    for (const id of ['e1', 'e2', 'e3', 't1', 't2']) expect(byId.get(id)?.fiscalYear).toBe(2025);
    for (const id of ['e5', 'm1', 'm2']) expect(byId.get(id)?.fiscalYear).toBe(2026);
  });

  it('uses UTC semantics at the year boundary (ADR-INCR3 Emenda 3 — matches fiscalYearFrom)', async () => {
    // 2026-01-01T00:00:00Z: America/Sao_Paulo would classify it as 2025 (Dec 31 21:00).
    const e4 = (await rows()).find((r) => r.id === 'e4');
    expect(e4?.fiscalYear).toBe(2026);
  });

  it('numbers each partition 1..N in chronological order, including the mixed-format partition', async () => {
    const byId = new Map((await rows()).map((r) => [r.id, r]));
    expect(['e1', 'e2', 'e3'].map((id) => byId.get(id)?.entryNumber)).toEqual([1, 2, 3]);
    expect(['e4', 'e5'].map((id) => byId.get(id)?.entryNumber)).toEqual([1, 2]);
    expect(['t1', 't2'].map((id) => byId.get(id)?.entryNumber)).toEqual([1, 2]);
    // Mixed partition: TEXT row is chronologically first and must get #1 —
    // fails if ORDER BY compares raw storage classes instead of normalized time.
    expect(byId.get('m1')?.entryNumber).toBe(1);
    expect(byId.get('m2')?.entryNumber).toBe(2);
  });

  it('seeds sequences with MAX(entryNumber) per partition and drops the stale row', async () => {
    const seqs = await db.$queryRawUnsafe<Array<{ userId: string; unitId: string; fiscalYear: unknown; last: unknown }>>(
      'SELECT "userId", "unitId", "fiscalYear", "last" FROM "journal_entry_sequences"',
    );
    const norm = seqs.map((s) => ({ ...s, fiscalYear: Number(s.fiscalYear), last: Number(s.last) }));
    expect(norm).toHaveLength(4);
    expect(norm).toEqual(expect.arrayContaining([
      expect.objectContaining({ userId: 'u1', unitId: 'unitA', fiscalYear: 2025, last: 3 }),
      expect.objectContaining({ userId: 'u1', unitId: 'unitA', fiscalYear: 2026, last: 2 }),
      expect.objectContaining({ userId: 'u1', unitId: 'unitB', fiscalYear: 2025, last: 2 }),
      expect.objectContaining({ userId: 'u2', unitId: 'unitC', fiscalYear: 2026, last: 2 }),
    ]));
    expect(norm.find((s) => s.userId === 'stale')).toBeUndefined();
  });

  it('leaves no journal_entries_new behind and keeps the unique numbering index', async () => {
    const tables = await db.$queryRawUnsafe<Array<{ name: string }>>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name IN ('journal_entries','journal_entries_new')",
    );
    expect(tables.map((t) => t.name)).toEqual(['journal_entries']);
    const idx = await db.$queryRawUnsafe<Array<{ name: string }>>(
      "SELECT name FROM sqlite_master WHERE type='index' AND name='journal_entries_userId_unitId_fiscalYear_entryNumber_key'",
    );
    expect(idx).toHaveLength(1);
  });
});
