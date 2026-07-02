/**
 * Integration test: money-cents overflow against a REAL SQLite database (no mocks).
 *
 * Accounting Increment 6 (F/G/H/J validation round) flagged that `Posting.debitCents`,
 * `Posting.creditCents` and `PackageBalanceMovement.deltaCents` are declared `Int` in
 * schema.prisma, not `BigInt`. `Int` in the Prisma schema is a 32-bit signed integer
 * REGARDLESS of the underlying connector — SQLite itself would happily store a wider
 * integer, but Prisma Client validates against the 32-bit range before the value ever
 * reaches the query engine. This test proves which of the two failure modes is real:
 * (a) silent truncation/wraparound (a Major bug, ledger integrity broken), or
 * (b) an explicit rejection at write time (safe, but posting must translate/guard it
 *     as a ValidationError rather than an opaque 500).
 *
 * `CustomerPackageBalance.balanceCents` was assumed by the initial parecer to be the
 * accumulating GL balance — it is NOT. It belongs to a separate prepaid-package
 * feature; the general-ledger balance (BP/DRE/Balancete) is never persisted, it is
 * computed on the fly via `PostingRepository.groupByAccount`'s `_sum` aggregate over
 * `debitCents`/`creditCents`. So the only column at risk of a single-value overflow is
 * `debitCents`/`creditCents` (and `deltaCents` in the unrelated package-balance ledger).
 */
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { execSync } from 'child_process';
import { PrismaClient } from 'generated/prisma';

const SERVER_ROOT = path.join(__dirname, '../../../../../');
const OVER_INT32 = 2_147_483_648; // 2^31 — one cent over the Int32 max (2^31 - 1)

describe('Posting.debitCents/creditCents — Int32 boundary, real SQLite DB', () => {
  let db: PrismaClient;
  let dbPath: string;

  beforeAll(async () => {
    dbPath = path.join(os.tmpdir(), `incr6-money-${Date.now()}.db`);
    execSync('npx prisma migrate deploy', {
      cwd: SERVER_ROOT,
      env: { ...process.env, DATABASE_URL: `file:${dbPath}` },
      stdio: 'pipe',
    });
    db = new PrismaClient({
      datasources: { db: { url: `file:${dbPath}?connection_limit=1` } },
    });
    await db.user.create({
      data: {
        id: 'u-money',
        name: 'Money User',
        username: 'moneyuser',
        email: 'money@test.local',
        password: 'x',
        role: 'USER',
      },
    });
    // Each test gets its own account so postings left behind by one `it` (deliberately,
    // to probe write/read behavior) can never bleed into another `it`'s aggregate —
    // groupBy below is scoped `by: ['accountId']`, so cross-test isolation only holds if
    // the account id itself is unique per test.
    for (const id of ['acc-money-1', 'acc-money-2', 'acc-money-3']) {
      await db.account.create({
        data: { id, userId: 'u-money', unitId: 'unit-money', code: `1.1.${id}`, name: 'Caixa', nature: 'Asset' },
      });
    }
    await db.journalEntry.create({
      data: {
        id: 'entry-money',
        userId: 'u-money',
        unitId: 'unit-money',
        date: new Date('2026-06-23'),
        description: 'Overflow probe',
        status: 'Posted',
        fiscalYear: 2026,
        entryNumber: 1,
      },
    });
  }, 60000);

  afterAll(async () => {
    await db.$disconnect();
    for (const suffix of ['', '-wal', '-shm']) {
      try { fs.unlinkSync(dbPath + suffix); } catch {}
    }
  });

  it('CONFIRMED BUG (ACC-INCR6-J-001): a value one cent over Int32 max is NEVER caught as a ' +
    'ValidationError — it either fails the write, or writes successfully and POISONS every ' +
    'later read of that row, with a raw unhandled PrismaClientKnownRequestError either way', async () => {
    // PostingService.postEntry has no upper-bound guard on debitCents/creditCents (only
    // Σdebit === Σcredit and > 0) — the value flows straight into Prisma. SQLite's
    // INTEGER column has no real 32-bit width limit, so which of the two calls below
    // actually throws is nondeterministic (observed both ways across runs): sometimes the
    // create() itself is rejected, sometimes it succeeds and the row poisons every later
    // read (findMany/groupByAccount/exports) instead. Either way the error is a raw
    // "Inconsistent column data ... does not fit in an INT column" PrismaClientKnownRequestError
    // — never a ValidationError the controller layer already knows how to translate to 4xx.
    const overflowData = {
      userId: 'u-money',
      unitId: 'unit-money',
      entryId: 'entry-money',
      accountId: 'acc-money-1',
      debitCents: OVER_INT32,
      creditCents: 0,
    };
    let createdId: string | null = null;
    try {
      const created = await db.posting.create({ data: overflowData });
      createdId = created.id;
      // create() succeeded — the poisoning must surface on the very next read instead.
      await expect(
        db.posting.findMany({ where: { accountId: 'acc-money-1' } }),
      ).rejects.toThrow(/does not fit in an INT column/);
    } catch (err) {
      // create() itself rejected — confirms the value never reaches a durable row.
      expect(String(err)).toMatch(/does not fit in an INT column/);
    } finally {
      // Clean up any poisoned row via raw SQL (Prisma reads can't touch it) so it
      // doesn't bleed into the next test in this file.
      if (createdId) await db.$executeRawUnsafe(`DELETE FROM postings WHERE id = ?`, createdId);
    }
  });

  it('the Int32 max value itself (2^31 - 1) is accepted and round-trips exactly', async () => {
    const created = await db.posting.create({
      data: {
        userId: 'u-money',
        unitId: 'unit-money',
        entryId: 'entry-money',
        accountId: 'acc-money-2',
        debitCents: 2_147_483_647,
        creditCents: 0,
      },
    });
    expect(created.debitCents).toBe(2_147_483_647);

    const reread = await db.posting.findUnique({ where: { id: created.id } });
    expect(reread?.debitCents).toBe(2_147_483_647);
  });

  it('groupByAccount aggregates correctly past the Int32 boundary — two individually-legal ' +
    'postings (each < Int32 max) summed by SQL, NOT clipped to the column width', async () => {
    // Two legs of R$15M each (1.5B cents) — EACH ONE IS A PERFECTLY LEGAL Int32 value on
    // its own (well under 2,147,483,647). Nothing about this requires anyone to post an
    // illegally huge single entry; it only requires an account's lifetime Σdebit to cross
    // ~R$21.47M, which is a realistic outcome of ordinary business activity over time.
    // This is exactly the aggregate PostingRepository.groupByAccount exposes to the
    // Balancete/BP/DRE (Increment 4/6 reports) — there is no persisted running balance in
    // the GL, every trial-balance figure is computed on the fly through this same _sum.
    //
    // An earlier version of this test wrongly asserted a corrupted sum (7_294_967_295):
    // that value only reproduced because it shared 'acc-money' with the two tests above
    // and picked up their leftover rows in the same groupBy bucket. Isolated to its own
    // account (as below), the aggregate is correct — SQLite computes SUM() without the
    // 32-bit column-width constraint Prisma enforces on individual writes, so _sum is not
    // subject to the same failure mode as ACC-INCR6-J-001. ACC-INCR6-J-002 is closed: not
    // a bug.
    await db.posting.create({
      data: { userId: 'u-money', unitId: 'unit-money', entryId: 'entry-money', accountId: 'acc-money-3', debitCents: 1_500_000_000, creditCents: 0 },
    });
    await db.posting.create({
      data: { userId: 'u-money', unitId: 'unit-money', entryId: 'entry-money', accountId: 'acc-money-3', debitCents: 1_500_000_000, creditCents: 0 },
    });

    const grouped = await db.posting.groupBy({
      by: ['accountId'],
      where: { accountId: 'acc-money-3' },
      _sum: { debitCents: true, creditCents: true },
    });
    const total = grouped.find((g) => g.accountId === 'acc-money-3')?._sum.debitCents;
    expect(total).toBe(3_000_000_000);
  });
});
