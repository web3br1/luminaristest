/**
 * Integration test: PostingRepository.nextEntryNumber against a REAL SQLite database.
 * No mocks — verifies the upsert+increment counter is gapless under concurrent access
 * (ADR-INCR3 Q11 / Emenda 8).
 *
 * SQLite WAL serializes writers, so Promise.all in a single process correctly exercises
 * the "lost update" scenario that max()+1 would fail on.
 */
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { execSync } from 'child_process';
import { PrismaClient } from 'generated/prisma';

const SERVER_ROOT = path.join(__dirname, '../../../../../');

describe('nextEntryNumber — SQLite real DB, same partition', () => {
  let db: PrismaClient;
  let dbPath: string;

  beforeAll(async () => {
    dbPath = path.join(os.tmpdir(), `incr3-conc-${Date.now()}.db`);
    execSync('npx prisma migrate deploy', {
      cwd: SERVER_ROOT,
      env: { ...process.env, DATABASE_URL: `file:${dbPath}` },
      stdio: 'pipe',
    });
    db = new PrismaClient({
      // socket_timeout=60: SQLite serializes writers; 50 concurrent txs need more than the 5s default.
      // connection_limit=1: single-writer SQLite doesn't benefit from a pool.
      datasources: { db: { url: `file:${dbPath}?socket_timeout=60&connection_limit=1` } },
    });
    await db.user.create({
      data: {
        id: 'u-conc',
        name: 'Conc User',
        username: 'concuser',
        email: 'conc@test.local',
        password: 'x',
        role: 'USER',
      },
    });
  }, 60000);

  afterAll(async () => {
    await db.$disconnect();
    for (const suffix of ['', '-wal', '-shm']) {
      try { fs.unlinkSync(dbPath + suffix); } catch {}
    }
  });

  it('50 concurrent upsert+increment calls produce entryNumbers 1..50 without gaps or duplicates', async () => {
    const userId = 'u-conc';
    const unitId = 'unit-conc';
    const fiscalYear = 2026;

    // 50 concurrent transactions — each atomically increments the sequence
    const results = await Promise.all(
      Array.from({ length: 50 }, () =>
        db.$transaction(async (tx) => {
          const seq = await tx.journalEntrySequence.upsert({
            where: { userId_unitId_fiscalYear: { userId, unitId, fiscalYear } },
            create: { userId, unitId, fiscalYear, last: 1 },
            update: { last: { increment: 1 } },
            select: { last: true },
          });
          return seq.last;
        }),
      ),
    );

    // All 50 returned values must be distinct and cover exactly 1..50
    const sorted = [...results].sort((a, b) => a - b);
    expect(sorted).toEqual(Array.from({ length: 50 }, (_, i) => i + 1));

    // Sequence head must be 50
    const head = await db.journalEntrySequence.findUnique({
      where: { userId_unitId_fiscalYear: { userId, unitId, fiscalYear } },
    });
    expect(head?.last).toBe(50);
    expect(results).toHaveLength(50);
  }, 60000);

  it('rollback: counter incremented but tx rolled back → next call gets same number', async () => {
    const userId = 'u-conc';
    const unitId = 'unit-rollback';
    const fiscalYear = 2026;

    // First call: succeed → last = 1
    const first = await db.$transaction(async (tx) => {
      const seq = await tx.journalEntrySequence.upsert({
        where: { userId_unitId_fiscalYear: { userId, unitId, fiscalYear } },
        create: { userId, unitId, fiscalYear, last: 1 },
        update: { last: { increment: 1 } },
        select: { last: true },
      });
      return seq.last;
    });
    expect(first).toBe(1);

    // Second call: increment inside tx but then rollback (throw)
    await expect(
      db.$transaction(async (tx) => {
        await tx.journalEntrySequence.upsert({
          where: { userId_unitId_fiscalYear: { userId, unitId, fiscalYear } },
          create: { userId, unitId, fiscalYear, last: 1 },
          update: { last: { increment: 1 } },
          select: { last: true },
        });
        throw new Error('simulated failure — tx rolls back');
      }),
    ).rejects.toThrow('simulated failure');

    // Head is still 1 (rollback undid the increment)
    const head = await db.journalEntrySequence.findUnique({
      where: { userId_unitId_fiscalYear: { userId, unitId, fiscalYear } },
    });
    expect(head?.last).toBe(1);

    // Third call: should get 2 (not 3 — the rolled-back increment is gone)
    const third = await db.$transaction(async (tx) => {
      const seq = await tx.journalEntrySequence.upsert({
        where: { userId_unitId_fiscalYear: { userId, unitId, fiscalYear } },
        create: { userId, unitId, fiscalYear, last: 1 },
        update: { last: { increment: 1 } },
        select: { last: true },
      });
      return seq.last;
    });
    expect(third).toBe(2);
  }, 30000);
});
