/**
 * Integration test: `findOutstanding` (AP + AR) against a REAL SQLite database. No mocks.
 * Proves the SCHEMA-LEVEL filter the mocked service test cannot (sintetico-nao-cobre-formato-de-dado-real):
 * the WHERE-clause of PayableRepository.findOutstanding / ReceivableRepository.findOutstanding actually
 * INCLUDES the "em aberto" statuses (OPEN + in-flight PAYING/RECEIVING) and EXCLUDES the terminal
 * PAID/RECEIVED, CANCELLED and soft-deleted rows — using APP-WRITTEN data through Prisma (dueDate stored
 * as it really is, ms-epoch), never SQL fixtures.
 *
 * FK enforcement ON; dedicated client harness mirrors PayableClaim.integration.test.ts.
 */
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { execSync } from 'child_process';
import { PrismaClient } from 'generated/prisma';
import { PayableRepository } from '../PayableRepository';
import { ReceivableRepository } from '../ReceivableRepository';
import type { AccountingScope } from '../../scope/AccountingScope';

const SERVER_ROOT = path.join(__dirname, '../../../../../');
const USER_ID = 'u-aging';
const UNIT = 'unit-aging';

const scope: AccountingScope = {
  ownerUserId: USER_ID,
  actorUserId: USER_ID,
  unitId: UNIT,
  ledgerCode: 'DEFAULT',
  baseCurrencyCode: 'BRL',
  timeZone: 'America/Sao_Paulo',
};

describe('findOutstanding (AP + AR) — real SQLite DB (INCR-AGING F-AG3)', () => {
  let db: PrismaClient;
  let dbPath: string;

  beforeAll(async () => {
    dbPath = path.join(os.tmpdir(), `aging-${Date.now()}.db`);
    execSync('npx prisma migrate deploy', {
      cwd: SERVER_ROOT,
      env: { ...process.env, DATABASE_URL: `file:${dbPath}` },
      stdio: 'pipe',
    });
    db = new PrismaClient({
      datasources: { db: { url: `file:${dbPath}?socket_timeout=60&connection_limit=1` } },
    });
    await db.user.create({
      data: { id: USER_ID, name: 'Aging User', username: 'aginguser', email: 'aging@test.local', password: 'x', role: 'USER' },
    });
    await db.account.create({
      data: { id: 'acc-exp', userId: USER_ID, unitId: UNIT, code: '4.1', name: 'Despesas', nature: 'Expense', acceptsEntries: true },
    });
    await db.account.create({
      data: { id: 'acc-rev', userId: USER_ID, unitId: UNIT, code: '3.1', name: 'Receitas', nature: 'Revenue', acceptsEntries: true },
    });

    // Payables covering every status + a soft-deleted row.
    const mkPayable = (id: string, status: string, deleted = false) =>
      db.payable.create({
        data: {
          id, userId: USER_ID, unitId: UNIT, supplierName: `Forn ${id}`, documentNumber: `NF-${id}`,
          description: 'x', issueDate: new Date('2026-06-01'), dueDate: new Date('2026-07-01'),
          amountCents: 1000, expenseAccountId: 'acc-exp', status,
          ...(deleted ? { deletedAt: new Date() } : {}),
        },
      });
    await mkPayable('ap-open', 'OPEN');
    await mkPayable('ap-paying', 'PAYING');
    await mkPayable('ap-paid', 'PAID');
    await mkPayable('ap-cancelled', 'CANCELLED');
    await mkPayable('ap-open-deleted', 'OPEN', true);

    const mkReceivable = (id: string, status: string, deleted = false) =>
      db.receivable.create({
        data: {
          id, userId: USER_ID, unitId: UNIT, customerName: `Cli ${id}`, documentNumber: `FT-${id}`,
          description: 'x', issueDate: new Date('2026-06-01'), dueDate: new Date('2026-07-01'),
          amountCents: 2000, revenueAccountId: 'acc-rev', status,
          ...(deleted ? { deletedAt: new Date() } : {}),
        },
      });
    await mkReceivable('ar-open', 'OPEN');
    await mkReceivable('ar-receiving', 'RECEIVING');
    await mkReceivable('ar-received', 'RECEIVED');
    await mkReceivable('ar-cancelled', 'CANCELLED');
    await mkReceivable('ar-open-deleted', 'OPEN', true);
  }, 60000);

  afterAll(async () => {
    if (db) await db.$disconnect();
    for (const suffix of ['', '-wal', '-shm']) {
      try { fs.unlinkSync(dbPath + suffix); } catch {}
    }
  });

  it('AP findOutstanding retorna SÓ OPEN + PAYING (exclui PAID, CANCELLED, soft-deleted)', async () => {
    const repo = new PayableRepository();
    // Inject the dedicated test client (the repo defaults to the shared prisma).
    const rows = await repo.findOutstanding(scope, db as any);
    expect(rows.map((r) => r.id).sort()).toEqual(['ap-open', 'ap-paying']);
  }, 30000);

  it('AR findOutstanding retorna SÓ OPEN + RECEIVING (exclui RECEIVED, CANCELLED, soft-deleted)', async () => {
    const repo = new ReceivableRepository();
    const rows = await repo.findOutstanding(scope, db as any);
    expect(rows.map((r) => r.id).sort()).toEqual(['ar-open', 'ar-receiving']);
  }, 30000);
});
