/**
 * Integration test: the AR double-receipt race gate (D4) against a REAL SQLite database. No mocks.
 * Proves the SCHEMA-LEVEL guarantee the mocked service test cannot: the atomic conditional
 * `updateMany` OPEN→RECEIVING that ReceivableRepository.claimForReceipt issues actually SERIALIZES
 * under concurrency — of N concurrent claims on one OPEN receivable, exactly ONE gets count===1 and
 * the row ends up RECEIVING exactly once. Mirror of PayableClaim.integration.test. FK enforcement ON.
 */
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { execSync } from 'child_process';
import { PrismaClient } from 'generated/prisma';

const SERVER_ROOT = path.join(__dirname, '../../../../../');
const USER_ID = 'u-ar';
const UNIT = 'unit-ar';

/** The exact conditional transition ReceivableRepository.claimForReceipt issues. */
async function claim(db: PrismaClient, id: string): Promise<number> {
  const r = await db.receivable.updateMany({
    where: { id, userId: USER_ID, unitId: UNIT, status: 'OPEN', deletedAt: null },
    data: { status: 'RECEIVING' },
  });
  return r.count;
}

/** The exact conditional transition ReceivableRepository.markReceivedIfReceiving issues (finalize CAS). */
async function markReceived(db: PrismaClient, id: string): Promise<number> {
  const r = await db.receivable.updateMany({
    where: { id, userId: USER_ID, unitId: UNIT, status: 'RECEIVING' },
    data: { status: 'RECEIVED' },
  });
  return r.count;
}

describe('ReceivableRepository.claimForReceipt — real SQLite DB (INCR-AR D4)', () => {
  let db: PrismaClient;
  let dbPath: string;

  beforeAll(async () => {
    dbPath = path.join(os.tmpdir(), `ar-claim-${Date.now()}.db`);
    execSync('npx prisma migrate deploy', {
      cwd: SERVER_ROOT,
      env: { ...process.env, DATABASE_URL: `file:${dbPath}` },
      stdio: 'pipe',
    });
    db = new PrismaClient({
      datasources: { db: { url: `file:${dbPath}?socket_timeout=60&connection_limit=1` } },
    });
    await db.user.create({
      data: { id: USER_ID, name: 'AR User', username: 'aruser', email: 'ar@test.local', password: 'x', role: 'USER' },
    });
    await db.account.create({
      data: { id: 'acc-rev', userId: USER_ID, unitId: UNIT, code: '3.1', name: 'Receita', nature: 'Revenue', acceptsEntries: true },
    });
  }, 60000);

  afterAll(async () => {
    await db.$disconnect();
    for (const suffix of ['', '-wal', '-shm']) {
      try { fs.unlinkSync(dbPath + suffix); } catch {}
    }
  });

  async function seedOpenReceivable(id: string): Promise<void> {
    await db.receivable.create({
      data: {
        id, userId: USER_ID, unitId: UNIT, customerName: 'Cliente', documentNumber: `FAT-${id}`,
        description: 'x', issueDate: new Date('2026-06-10'), dueDate: new Date('2026-07-10'),
        amountCents: 50000, revenueAccountId: 'acc-rev', status: 'OPEN',
      },
    });
  }

  it('10 concurrent claims on one OPEN receivable → exactly one wins (count 1); row ends RECEIVING', async () => {
    await seedOpenReceivable('rec-race');
    const counts = await Promise.all(Array.from({ length: 10 }, () => claim(db, 'rec-race')));
    expect(counts.filter((c) => c === 1)).toHaveLength(1);
    expect(counts.filter((c) => c === 0)).toHaveLength(9);
    const row = await db.receivable.findUnique({ where: { id: 'rec-race' } });
    expect(row?.status).toBe('RECEIVING');
  }, 60000);

  it('a claim on a non-OPEN receivable returns 0 (no transition)', async () => {
    await seedOpenReceivable('rec-recv');
    await db.receivable.update({ where: { id: 'rec-recv' }, data: { status: 'RECEIVED' } });
    expect(await claim(db, 'rec-recv')).toBe(0);
  }, 30000);

  it('10 concurrent finalize CAS on one RECEIVING receivable → exactly one wins (exactly-once audit gate)', async () => {
    await seedOpenReceivable('rec-final');
    await db.receivable.update({ where: { id: 'rec-final' }, data: { status: 'RECEIVING' } });
    const counts = await Promise.all(Array.from({ length: 10 }, () => markReceived(db, 'rec-final')));
    expect(counts.filter((c) => c === 1)).toHaveLength(1); // only one emits receivable.receipt_registered
    expect(counts.filter((c) => c === 0)).toHaveLength(9);
    const row = await db.receivable.findUnique({ where: { id: 'rec-final' } });
    expect(row?.status).toBe('RECEIVED');
  }, 60000);

  it('rename-on-delete frees the business @@unique so a re-create does not trip P2002 (D3)', async () => {
    await seedOpenReceivable('rec-dup'); // documentNumber = 'FAT-rec-dup'
    await expect(
      db.receivable.create({
        data: {
          id: 'rec-dup2', userId: USER_ID, unitId: UNIT, customerName: 'Cliente', documentNumber: 'FAT-rec-dup',
          description: 'x', issueDate: new Date('2026-06-10'), dueDate: new Date('2026-07-10'),
          amountCents: 1, revenueAccountId: 'acc-rev', status: 'OPEN',
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
    await db.receivable.update({ where: { id: 'rec-dup' }, data: { status: 'CANCELLED', deletedAt: new Date(), documentNumber: 'deleted:rec-dup:FAT-rec-dup' } });
    const recreated = await db.receivable.create({
      data: {
        id: 'rec-dup3', userId: USER_ID, unitId: UNIT, customerName: 'Cliente', documentNumber: 'FAT-rec-dup',
        description: 'x', issueDate: new Date('2026-06-10'), dueDate: new Date('2026-07-10'),
        amountCents: 1, revenueAccountId: 'acc-rev', status: 'OPEN',
      },
    });
    expect(recreated.id).toBe('rec-dup3');
  }, 30000);
});
