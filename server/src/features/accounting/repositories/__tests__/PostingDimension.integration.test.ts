/**
 * Integration test: dimension tagging against a REAL SQLite database (INCR-DIM). No mocks. Proves the
 * SCHEMA-LEVEL guarantees the mocked service tests cannot:
 *  - ACC-024 (orthogonality): a PostingDimension tag does NOT change groupByAccount (the trial-balance
 *    aggregate is byte-identical with and without tags — the tag never enters the money sum).
 *  - ACC-025 (one value per axis per leg): the @@unique([postingId,definitionId]) rejects a second tag
 *    of the same axis at the DB level (the authoritative backstop behind the pre-tx app check).
 *  - FK integrity: a tag pointing at a non-existent value is rejected.
 *  - groupByAccountAndDimension buckets legs by (account × value) and reproduces the account totals
 *    when summed across values (incl. the untagged bucket).
 * Mirror of the AR/AP claim integration harness (prisma migrate deploy → real client, FK ON).
 */
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { execSync } from 'child_process';
import { PrismaClient } from 'generated/prisma';
import { LEDGER_STATUSES } from '../../models/ledgerStatus';

const SERVER_ROOT = path.join(__dirname, '../../../../../');
const USER_ID = 'u-dim';
const UNIT = 'unit-dim';

/**
 * The queries below run against the test's OWN client (`db`, bound to the temp DB) — NOT the
 * PostingRepository, which uses the lib/prisma singleton bound to the app DATABASE_URL. They mirror
 * groupByAccount / groupByAccountAndDimension exactly (same where + reduce), so they prove the same
 * DB behaviour the repo relies on. Mirrors the AR/AP claim integration tests (inline the query).
 */

describe('PostingDimension — real SQLite DB (INCR-DIM ACC-024/025)', () => {
  let db: PrismaClient;
  let dbPath: string;

  const ledgerWhere = { userId: USER_ID, unitId: UNIT, entry: { status: { in: LEDGER_STATUSES } } };
  const groupByAccount = () =>
    db.posting.groupBy({ by: ['accountId'], where: ledgerWhere, _sum: { debitCents: true, creditCents: true } });

  beforeAll(async () => {
    dbPath = path.join(os.tmpdir(), `dim-${Date.now()}.db`);
    execSync('npx prisma migrate deploy', {
      cwd: SERVER_ROOT,
      env: { ...process.env, DATABASE_URL: `file:${dbPath}` },
      stdio: 'pipe',
    });
    db = new PrismaClient({
      datasources: { db: { url: `file:${dbPath}?socket_timeout=60&connection_limit=1` } },
    });
    await db.user.create({
      data: { id: USER_ID, name: 'Dim User', username: 'dimuser', email: 'dim@test.local', password: 'x', role: 'USER' },
    });
    await db.account.createMany({
      data: [
        { id: 'acc-cash', userId: USER_ID, unitId: UNIT, code: '1.1.1', name: 'Banco', nature: 'Asset', acceptsEntries: true },
        { id: 'acc-exp', userId: USER_ID, unitId: UNIT, code: '4.1', name: 'Despesas', nature: 'Expense', acceptsEntries: true },
      ],
    });
    // One axis (cost center) with two values.
    await db.dimensionDefinition.create({ data: { id: 'def-cc', userId: USER_ID, unitId: UNIT, code: 'COST_CENTER', name: 'Centro de Custo', status: 'ACTIVE' } });
    await db.dimensionValue.createMany({
      data: [
        { id: 'v1', userId: USER_ID, unitId: UNIT, definitionId: 'def-cc', code: 'LOJA_A', name: 'Loja A', status: 'ACTIVE' },
        { id: 'v2', userId: USER_ID, unitId: UNIT, definitionId: 'def-cc', code: 'LOJA_B', name: 'Loja B', status: 'ACTIVE' },
      ],
    });
  }, 60000);

  afterAll(async () => {
    await db.$disconnect();
    for (const suffix of ['', '-wal', '-shm']) {
      try { fs.unlinkSync(dbPath + suffix); } catch {}
    }
  });

  /** Post a balanced entry (D 4.1 despesa / C 1.1.1 banco) and return the expense leg id. */
  async function postEntry(id: string, amount: number): Promise<string> {
    await db.journalEntry.create({
      data: { id, userId: USER_ID, unitId: UNIT, date: new Date('2026-06-15'), description: 'x', status: 'Posted', sourceType: 'manual', fiscalYear: 2026, entryNumber: Number(id.replace(/\D/g, '')) || 1 },
    });
    const expLeg = await db.posting.create({ data: { userId: USER_ID, unitId: UNIT, entryId: id, accountId: 'acc-exp', debitCents: amount, creditCents: 0 } });
    await db.posting.create({ data: { userId: USER_ID, unitId: UNIT, entryId: id, accountId: 'acc-cash', debitCents: 0, creditCents: amount } });
    return expLeg.id;
  }

  it('ACC-024: tagging a leg does NOT change groupByAccount (trial balance byte-identical)', async () => {
    const legId = await postEntry('e1', 10000);
    const before = await groupByAccount();
    await db.postingDimension.create({ data: { userId: USER_ID, unitId: UNIT, postingId: legId, definitionId: 'def-cc', valueId: 'v1' } });
    const after = await groupByAccount();
    expect(after).toEqual(before); // the tag is invisible to the account aggregate — orthogonal
  }, 60000);

  it('ACC-025: a second tag of the SAME axis on one leg is rejected by @@unique (DB backstop)', async () => {
    const legId = await postEntry('e2', 5000);
    await db.postingDimension.create({ data: { userId: USER_ID, unitId: UNIT, postingId: legId, definitionId: 'def-cc', valueId: 'v1' } });
    await expect(
      db.postingDimension.create({ data: { userId: USER_ID, unitId: UNIT, postingId: legId, definitionId: 'def-cc', valueId: 'v2' } }),
    ).rejects.toMatchObject({ code: 'P2002' });
  }, 60000);

  it('FK integrity: a tag pointing at a non-existent value is rejected', async () => {
    const legId = await postEntry('e3', 3000);
    await expect(
      db.postingDimension.create({ data: { userId: USER_ID, unitId: UNIT, postingId: legId, definitionId: 'def-cc', valueId: 'ghost' } }),
    ).rejects.toBeDefined();
  }, 60000);

  it('groupByAccountAndDimension buckets by (account × value) and the buckets sum to the account total', async () => {
    // Two expense legs on the same account, tagged to different cost centers + one untagged.
    const a = await postEntry('e4', 7000);
    const b = await postEntry('e5', 2000);
    const c = await postEntry('e6', 1000); // untagged
    await db.postingDimension.create({ data: { userId: USER_ID, unitId: UNIT, postingId: a, definitionId: 'def-cc', valueId: 'v1' } });
    await db.postingDimension.create({ data: { userId: USER_ID, unitId: UNIT, postingId: b, definitionId: 'def-cc', valueId: 'v2' } });
    void c;

    // Mirror groupByAccountAndDimension: fetch expense legs + their tag on the axis, reduce by (account × value).
    const legs = await db.posting.findMany({
      where: { userId: USER_ID, unitId: UNIT, accountId: 'acc-exp', entry: { status: { in: LEDGER_STATUSES } } },
      select: { debitCents: true, dimensions: { where: { definitionId: 'def-cc' }, select: { valueId: true } } },
    });
    const byValue = new Map<string | null, number>();
    for (const l of legs) {
      const vId = l.dimensions[0]?.valueId ?? null;
      byValue.set(vId, (byValue.get(vId) ?? 0) + l.debitCents);
    }
    // Σ buckets (incl. the untagged null bucket) == the plain account total — nothing lost/double-counted.
    const totalByDim = [...byValue.values()].reduce((s, v) => s + v, 0);
    const plain = (await groupByAccount()).find((r) => r.accountId === 'acc-exp')!;
    expect(totalByDim).toBe(plain._sum.debitCents);
    expect(byValue.get('v2')).toBe(2000);
    expect(byValue.get(null) ?? 0).toBeGreaterThanOrEqual(1000); // e6 untagged
    expect(byValue.has('v1')).toBe(true);
  }, 60000);
});
