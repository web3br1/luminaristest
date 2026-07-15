/**
 * Integration test: the INCR-COUNTERPARTY / A1 BACKFILL against a REAL SQLite database. No mocks.
 * Proves the two binding security gates of the data migration (the same properties the
 * smoke-migration-gate asserts on a copy of the real dev.db):
 *   • SEC-A1-2  dedupe by SCOPE — one Counterparty per DISTINCT (userId, unitId, name) per type; two
 *               tenants named "ACME" stay TWO rows, never collapse into one.
 *   • SEC-A1-3  zero cross-scope — every backfilled counterpartyId points at a Counterparty of the
 *               row's OWN (userId, unitId).
 *   • idempotent — running the backfill a 2nd time is a no-op (no P2002, counts unchanged).
 *
 * The SQL below is the EXACT backfill of migrations/20260715060000_incr_counterparty/migration.sql
 * (mirrored here the way PayableClaim.integration.test mirrors claimForPayment). Rows are seeded via
 * the Prisma client (INTEGER ms-epoch dates — real app write shape), with counterpartyId left NULL to
 * simulate the pre-migration state.
 */
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { execSync } from 'child_process';
import { PrismaClient } from 'generated/prisma';

const SERVER_ROOT = path.join(__dirname, '../../../../../');

const BACKFILL_SUPPLIERS_INSERT = `
INSERT OR IGNORE INTO "counterparties" ("id", "userId", "unitId", "type", "name", "ref", "createdById", "createdAt", "updatedAt", "deletedAt")
SELECT 'cp_' || lower(hex(randomblob(12))), "userId", "unitId", 'SUPPLIER', "supplierName", NULL, NULL,
       (CAST(strftime('%s','now') AS INTEGER) * 1000), (CAST(strftime('%s','now') AS INTEGER) * 1000), NULL
FROM "payables" GROUP BY "userId", "unitId", "supplierName";`;

const BACKFILL_SUPPLIERS_LINK = `
UPDATE "payables" SET "counterpartyId" = (
  SELECT "c"."id" FROM "counterparties" "c"
  WHERE "c"."userId" = "payables"."userId" AND "c"."unitId" = "payables"."unitId"
    AND "c"."type" = 'SUPPLIER' AND "c"."name" = "payables"."supplierName"
) WHERE "counterpartyId" IS NULL;`;

const BACKFILL_CUSTOMERS_INSERT = `
INSERT OR IGNORE INTO "counterparties" ("id", "userId", "unitId", "type", "name", "ref", "createdById", "createdAt", "updatedAt", "deletedAt")
SELECT 'cp_' || lower(hex(randomblob(12))), "userId", "unitId", 'CUSTOMER', "customerName", NULL, NULL,
       (CAST(strftime('%s','now') AS INTEGER) * 1000), (CAST(strftime('%s','now') AS INTEGER) * 1000), NULL
FROM "receivables" GROUP BY "userId", "unitId", "customerName";`;

const BACKFILL_CUSTOMERS_LINK = `
UPDATE "receivables" SET "counterpartyId" = (
  SELECT "c"."id" FROM "counterparties" "c"
  WHERE "c"."userId" = "receivables"."userId" AND "c"."unitId" = "receivables"."unitId"
    AND "c"."type" = 'CUSTOMER' AND "c"."name" = "receivables"."customerName"
) WHERE "counterpartyId" IS NULL;`;

async function runBackfill(db: PrismaClient): Promise<void> {
  await db.$executeRawUnsafe(BACKFILL_SUPPLIERS_INSERT);
  await db.$executeRawUnsafe(BACKFILL_SUPPLIERS_LINK);
  await db.$executeRawUnsafe(BACKFILL_CUSTOMERS_INSERT);
  await db.$executeRawUnsafe(BACKFILL_CUSTOMERS_LINK);
}

describe('INCR-COUNTERPARTY backfill — real SQLite DB (SEC-A1-2 / SEC-A1-3)', () => {
  let db: PrismaClient;
  let dbPath: string;

  beforeAll(async () => {
    dbPath = path.join(os.tmpdir(), `cp-backfill-${Date.now()}.db`);
    execSync('npx prisma migrate deploy', {
      cwd: SERVER_ROOT,
      env: { ...process.env, DATABASE_URL: `file:${dbPath}` },
      stdio: 'pipe',
    });
    db = new PrismaClient({
      datasources: { db: { url: `file:${dbPath}?socket_timeout=60&connection_limit=1` } },
    });

    // Two DISTINCT tenants, both with a supplier "ACME" (the collision SEC-A1-2 must NOT collapse).
    for (const u of ['u-A', 'u-B']) {
      await db.user.create({
        data: { id: u, name: u, username: u, email: `${u}@test.local`, password: 'x', role: 'USER' },
      });
      await db.account.create({
        data: { id: `exp-${u}`, userId: u, unitId: 'unit-1', code: '4.1', name: 'Despesas', nature: 'Expense', acceptsEntries: true },
      });
      await db.account.create({
        data: { id: `rev-${u}`, userId: u, unitId: 'unit-1', code: '3.1', name: 'Receita', nature: 'Revenue', acceptsEntries: true },
      });
    }

    const basePayable = (over: Record<string, unknown>) => ({
      unitId: 'unit-1', description: 'x', issueDate: new Date('2026-06-10'), dueDate: new Date('2026-07-10'),
      amountCents: 1000, status: 'OPEN', ...over,
    });
    // Tenant A: two "ACME" payables (dedupe within scope → 1 CP) + one "Beta" + one CANCELLED "ACME"
    // (soft-deleted rows must still backfill — supplierName is never mangled by rename-on-delete).
    await db.payable.create({ data: basePayable({ id: 'p-a1', userId: 'u-A', supplierName: 'ACME', documentNumber: 'NF-1', expenseAccountId: 'exp-u-A' }) as never });
    await db.payable.create({ data: basePayable({ id: 'p-a2', userId: 'u-A', supplierName: 'ACME', documentNumber: 'NF-2', expenseAccountId: 'exp-u-A' }) as never });
    await db.payable.create({ data: basePayable({ id: 'p-a3', userId: 'u-A', supplierName: 'Beta', documentNumber: 'NF-3', expenseAccountId: 'exp-u-A' }) as never });
    await db.payable.create({ data: basePayable({ id: 'p-a4', userId: 'u-A', supplierName: 'ACME', documentNumber: 'deleted:p-a4:NF-4', status: 'CANCELLED', deletedAt: new Date(), expenseAccountId: 'exp-u-A' }) as never });
    // Tenant B: one "ACME" payable (SAME name, DIFFERENT tenant → must be its own CP).
    await db.payable.create({ data: basePayable({ id: 'p-b1', userId: 'u-B', supplierName: 'ACME', documentNumber: 'NF-1', expenseAccountId: 'exp-u-B' }) as never });

    // Receivables: tenant A has two "Cliente X" receivables (dedupe → 1 CP).
    const baseRec = (over: Record<string, unknown>) => ({
      unitId: 'unit-1', description: 'x', issueDate: new Date('2026-06-10'), dueDate: new Date('2026-07-10'),
      amountCents: 1000, status: 'OPEN', ...over,
    });
    await db.receivable.create({ data: baseRec({ id: 'r-a1', userId: 'u-A', customerName: 'Cliente X', documentNumber: 'FAT-1', revenueAccountId: 'rev-u-A' }) as never });
    await db.receivable.create({ data: baseRec({ id: 'r-a2', userId: 'u-A', customerName: 'Cliente X', documentNumber: 'FAT-2', revenueAccountId: 'rev-u-A' }) as never });
    await db.receivable.create({ data: baseRec({ id: 'r-b1', userId: 'u-B', customerName: 'Cliente X', documentNumber: 'FAT-1', revenueAccountId: 'rev-u-B' }) as never });

    await runBackfill(db);
  }, 60000);

  afterAll(async () => {
    await db?.$disconnect();
    for (const suffix of ['', '-journal', '-wal', '-shm']) {
      try { fs.unlinkSync(`${dbPath}${suffix}`); } catch { /* ignore */ }
    }
  });

  it('SEC-A1-2: dedupes SUPPLIERS by (userId, unitId, name) — two tenants "ACME" stay two rows', async () => {
    const acme = await db.counterparty.findMany({ where: { type: 'SUPPLIER', name: 'ACME' } });
    expect(acme).toHaveLength(2); // one for u-A, one for u-B — NOT collapsed
    expect(new Set(acme.map((c) => c.userId))).toEqual(new Set(['u-A', 'u-B']));

    // Within u-A the two "ACME" payables (+ the cancelled one) share ONE counterparty.
    const aAcme = await db.counterparty.count({ where: { userId: 'u-A', type: 'SUPPLIER', name: 'ACME' } });
    expect(aAcme).toBe(1);
    const aTotal = await db.counterparty.count({ where: { userId: 'u-A', type: 'SUPPLIER' } });
    expect(aTotal).toBe(2); // ACME + Beta
  });

  it('SEC-A1-2: dedupes CUSTOMERS by scope too', async () => {
    const x = await db.counterparty.findMany({ where: { type: 'CUSTOMER', name: 'Cliente X' } });
    expect(x).toHaveLength(2); // u-A + u-B
  });

  it('SEC-A1-3: every payable/receivable links to a counterparty of its OWN scope (zero cross-scope)', async () => {
    const payables = await db.payable.findMany({ include: { counterparty: true } });
    expect(payables.every((p) => p.counterpartyId !== null)).toBe(true);
    for (const p of payables) {
      expect(p.counterparty!.userId).toBe(p.userId);
      expect(p.counterparty!.unitId).toBe(p.unitId);
      expect(p.counterparty!.type).toBe('SUPPLIER');
      expect(p.counterparty!.name).toBe(p.supplierName);
    }
    // Cross-scope raw guard (the exact smoke-gate assertion): no link crosses a tenant boundary.
    const crossScope = await db.$queryRawUnsafe<{ n: number }[]>(
      `SELECT COUNT(*) AS n FROM "payables" p JOIN "counterparties" c ON p."counterpartyId" = c."id"
       WHERE p."userId" <> c."userId" OR p."unitId" <> c."unitId";`,
    );
    expect(Number(crossScope[0].n)).toBe(0);

    const receivables = await db.receivable.findMany({ include: { counterparty: true } });
    for (const r of receivables) {
      expect(r.counterparty!.userId).toBe(r.userId);
      expect(r.counterparty!.type).toBe('CUSTOMER');
      expect(r.counterparty!.name).toBe(r.customerName);
    }
  });

  it('is idempotent — a 2nd backfill run adds nothing and throws no P2002', async () => {
    const before = await db.counterparty.count();
    await runBackfill(db); // must not throw
    const after = await db.counterparty.count();
    expect(after).toBe(before);
  });
});
