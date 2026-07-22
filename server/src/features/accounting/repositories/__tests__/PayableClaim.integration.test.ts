/**
 * Integration test: the AP double-payment race gate (D4) against a REAL SQLite database. No mocks.
 * Proves the SCHEMA-LEVEL guarantee the mocked service test cannot: the atomic conditional
 * `updateMany` OPEN→PAYING that PayableRepository.claimForPayment issues actually SERIALIZES under
 * concurrency — of N concurrent claims on one OPEN payable, exactly ONE gets count===1 and the row
 * ends up PAYING exactly once.
 *
 * SQLite WAL serializes writers, so Promise.all in a single process exercises the real race.
 * Mirrors the dedicated-client harness of PostingRepository.concurrency.test.ts. FK enforcement ON.
 */
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { execSync } from 'child_process';
import { PrismaClient } from 'generated/prisma';

const SERVER_ROOT = path.join(__dirname, '../../../../../');
const USER_ID = 'u-ap';
const UNIT = 'unit-ap';

/** The exact conditional transition PayableRepository.claimForPayment issues. */
async function claim(db: PrismaClient, id: string): Promise<number> {
  const r = await db.payable.updateMany({
    where: { id, userId: USER_ID, unitId: UNIT, status: 'OPEN', deletedAt: null },
    data: { status: 'PAYING' },
  });
  return r.count;
}

/** The exact conditional transition PayableRepository.markPaidIfPaying issues (finalize CAS). */
async function markPaid(db: PrismaClient, id: string): Promise<number> {
  const r = await db.payable.updateMany({
    where: { id, userId: USER_ID, unitId: UNIT, status: 'PAYING' },
    data: { status: 'PAID' },
  });
  return r.count;
}

describe('PayableRepository.claimForPayment — real SQLite DB (INCR-AP D4)', () => {
  let db: PrismaClient;
  let dbPath: string;

  beforeAll(async () => {
    dbPath = path.join(os.tmpdir(), `ap-claim-${Date.now()}.db`);
    execSync('npx prisma migrate deploy', {
      cwd: SERVER_ROOT,
      env: { ...process.env, DATABASE_URL: `file:${dbPath}` },
      stdio: 'pipe',
    });
    db = new PrismaClient({
      datasources: { db: { url: `file:${dbPath}?socket_timeout=60&connection_limit=1` } },
    });
    await db.user.create({
      data: { id: USER_ID, name: 'AP User', username: 'apuser', email: 'ap@test.local', password: 'x', role: 'USER' },
    });
    await db.account.create({
      data: { id: 'acc-exp', userId: USER_ID, unitId: UNIT, code: '4.1', name: 'Despesas', nature: 'Expense', acceptsEntries: true },
    });
  }, 60000);

  afterAll(async () => {
    await db.$disconnect();
    for (const suffix of ['', '-wal', '-shm']) {
      try { fs.unlinkSync(dbPath + suffix); } catch {}
    }
  });

  async function seedOpenPayable(id: string): Promise<void> {
    await db.payable.create({
      data: {
        id, userId: USER_ID, unitId: UNIT, supplierName: 'ACME', documentNumber: `NF-${id}`,
        description: 'x', issueDate: new Date('2026-06-10'), dueDate: new Date('2026-07-10'),
        amountCents: 50000, expenseAccountId: 'acc-exp', status: 'OPEN',
      },
    });
  }

  it('10 concurrent claims on one OPEN payable → exactly one wins (count 1); row ends PAYING', async () => {
    await seedOpenPayable('pay-race');
    const counts = await Promise.all(Array.from({ length: 10 }, () => claim(db, 'pay-race')));
    expect(counts.filter((c) => c === 1)).toHaveLength(1);
    expect(counts.filter((c) => c === 0)).toHaveLength(9);
    const row = await db.payable.findUnique({ where: { id: 'pay-race' } });
    expect(row?.status).toBe('PAYING');
  }, 60000);

  it('a claim on a non-OPEN payable returns 0 (no transition)', async () => {
    await seedOpenPayable('pay-paid');
    await db.payable.update({ where: { id: 'pay-paid' }, data: { status: 'PAID' } });
    expect(await claim(db, 'pay-paid')).toBe(0);
  }, 30000);

  it('10 concurrent finalize CAS on one PAYING payable → exactly one wins (exactly-once audit gate)', async () => {
    await seedOpenPayable('pay-final');
    await db.payable.update({ where: { id: 'pay-final' }, data: { status: 'PAYING' } });
    const counts = await Promise.all(Array.from({ length: 10 }, () => markPaid(db, 'pay-final')));
    expect(counts.filter((c) => c === 1)).toHaveLength(1); // only one emits payable.payment_registered
    expect(counts.filter((c) => c === 0)).toHaveLength(9);
    const row = await db.payable.findUnique({ where: { id: 'pay-final' } });
    expect(row?.status).toBe('PAID');
  }, 60000);

  it('rename-on-delete frees the business @@unique so a re-create does not trip P2002 (D3)', async () => {
    await seedOpenPayable('pay-dup'); // documentNumber = 'NF-pay-dup'
    // A second live payable with the same (supplier, documentNumber) collides.
    await expect(
      db.payable.create({
        data: {
          id: 'pay-dup2', userId: USER_ID, unitId: UNIT, supplierName: 'ACME', documentNumber: 'NF-pay-dup',
          description: 'x', issueDate: new Date('2026-06-10'), dueDate: new Date('2026-07-10'),
          amountCents: 1, expenseAccountId: 'acc-exp', status: 'OPEN',
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
    // Rename-on-delete the first, then re-create succeeds (key freed).
    await db.payable.update({ where: { id: 'pay-dup' }, data: { status: 'CANCELLED', deletedAt: new Date(), documentNumber: 'deleted:pay-dup:NF-pay-dup' } });
    const recreated = await db.payable.create({
      data: {
        id: 'pay-dup3', userId: USER_ID, unitId: UNIT, supplierName: 'ACME', documentNumber: 'NF-pay-dup',
        description: 'x', issueDate: new Date('2026-06-10'), dueDate: new Date('2026-07-10'),
        amountCents: 1, expenseAccountId: 'acc-exp', status: 'OPEN',
      },
    });
    expect(recreated.id).toBe('pay-dup3');
  }, 30000);
});
