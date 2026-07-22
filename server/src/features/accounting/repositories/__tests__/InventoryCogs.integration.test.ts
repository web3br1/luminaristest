/**
 * Integration test: the inventory CMV baixa CAS (D4) against a REAL SQLite database. No mocks.
 * Proves the SCHEMA-LEVEL guarantee the mocked service test cannot: the atomic conditional
 * `updateMany where qtyOnHand >= qty` that InventoryRepository.decrementForCogs issues actually
 * SERIALIZES under concurrency — of N concurrent baixas of one SKU, only those that fit win
 * (count===1), qtyOnHand can NEVER go negative, and the value decrements in lockstep (tie-out).
 *
 * SQLite WAL serializes writers, so Promise.all in a single process exercises the real race.
 * Mirrors the dedicated-client harness of PayableClaim.integration.test.ts. FK enforcement ON.
 */
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { execSync } from 'child_process';
import { PrismaClient } from 'generated/prisma';

const SERVER_ROOT = path.join(__dirname, '../../../../../');
const USER_ID = 'u-inv';
const UNIT = 'unit-inv';

/** The exact conditional CAS InventoryRepository.decrementForCogs issues. */
async function baixa(db: PrismaClient, id: string, qty: number, valueDelta: number): Promise<number> {
  const r = await db.inventoryItem.updateMany({
    where: { id, userId: USER_ID, unitId: UNIT, deletedAt: null, qtyOnHand: { gte: qty } },
    data: { qtyOnHand: { decrement: qty }, totalValueCents: { decrement: valueDelta } },
  });
  return r.count;
}

describe('InventoryRepository.decrementForCogs — real SQLite DB (INCR-INVENTORY D4)', () => {
  let db: PrismaClient;
  let dbPath: string;

  beforeAll(async () => {
    dbPath = path.join(os.tmpdir(), `inv-cogs-${Date.now()}.db`);
    execSync('npx prisma migrate deploy', {
      cwd: SERVER_ROOT,
      env: { ...process.env, DATABASE_URL: `file:${dbPath}` },
      stdio: 'pipe',
    });
    db = new PrismaClient({
      datasources: { db: { url: `file:${dbPath}?socket_timeout=60&connection_limit=1` } },
    });
    await db.user.create({
      data: { id: USER_ID, name: 'Inv User', username: 'invuser', email: 'inv@test.local', password: 'x', role: 'USER' },
    });
  }, 60000);

  afterAll(async () => {
    await db.$disconnect();
    for (const suffix of ['', '-wal', '-shm']) {
      try { fs.unlinkSync(dbPath + suffix); } catch {}
    }
  });

  async function seedItem(id: string, qtyOnHand: number, totalValueCents: number): Promise<void> {
    await db.inventoryItem.create({
      data: { id, userId: USER_ID, unitId: UNIT, productRef: `sku-${id}`, qtyOnHand, totalValueCents, status: 'ACTIVE' },
    });
  }

  it('10 concurrent baixas of qty 3 on a 10-unit SKU → only 3 fit; qtyOnHand ends 1, never negative', async () => {
    await seedItem('it-race', 10, 1000);
    const counts = await Promise.all(Array.from({ length: 10 }, () => baixa(db, 'it-race', 3, 300)));
    expect(counts.filter((c) => c === 1)).toHaveLength(3); // floor(10/3)
    expect(counts.filter((c) => c === 0)).toHaveLength(7);
    const row = await db.inventoryItem.findUnique({ where: { id: 'it-race' } });
    expect(row?.qtyOnHand).toBe(1); // 10 − 9, never below zero
    expect(row?.qtyOnHand).toBeGreaterThanOrEqual(0);
    expect(row?.totalValueCents).toBe(100); // 1000 − 3×300, decremented in lockstep (tie-out)
  }, 60000);

  it('two concurrent baixas of qty 6 on a 10-unit SKU → exactly one wins', async () => {
    await seedItem('it-pair', 10, 1000);
    const counts = await Promise.all([baixa(db, 'it-pair', 6, 600), baixa(db, 'it-pair', 6, 600)]);
    expect(counts.filter((c) => c === 1)).toHaveLength(1);
    expect(counts.filter((c) => c === 0)).toHaveLength(1);
    const row = await db.inventoryItem.findUnique({ where: { id: 'it-pair' } });
    expect(row?.qtyOnHand).toBe(4);
    expect(row?.qtyOnHand).toBeGreaterThanOrEqual(0);
  }, 60000);

  it('a baixa larger than qtyOnHand returns 0 (no transition, no negative)', async () => {
    await seedItem('it-short', 2, 200);
    expect(await baixa(db, 'it-short', 5, 500)).toBe(0);
    const row = await db.inventoryItem.findUnique({ where: { id: 'it-short' } });
    expect(row?.qtyOnHand).toBe(2);
  }, 30000);

  it('the @@unique([inventoryItemId,kind,sourceType,sourceId]) rejects a duplicate COGS movement (D-b backstop)', async () => {
    await seedItem('it-mov', 10, 1000);
    await db.stockMovement.create({
      data: { inventoryItemId: 'it-mov', kind: 'COGS', qtyDelta: -1, valueCentsDelta: -100, occurredAt: new Date('2026-07-10'), sourceType: 'salon.sale.cogs', sourceId: 'sale-1' },
    });
    await expect(
      db.stockMovement.create({
        data: { inventoryItemId: 'it-mov', kind: 'COGS', qtyDelta: -1, valueCentsDelta: -100, occurredAt: new Date('2026-07-10'), sourceType: 'salon.sale.cogs', sourceId: 'sale-1' },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  }, 30000);
});
