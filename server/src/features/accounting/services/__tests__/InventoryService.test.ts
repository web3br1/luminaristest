import { InventoryService } from '../InventoryService';
import type {
  IInventoryRepository,
  CreateInventoryItemData,
  CreateStockMovementData,
  MovementSourceKey,
  MovementSourceQuery,
} from '../../repositories/IInventoryRepository';
import { ForbiddenError, ValidationError } from '../../../../lib/errors';
import { resolveAccountingScope } from '../../scope/AccountingScope';
import { INVENTORY_COGS_SOURCE_TYPE, INVENTORY_INBOUND_SOURCE_TYPE } from '../../models/Inventory.model';
import type { InventoryItem, StockMovement, Prisma } from 'generated/prisma';

const scope = resolveAccountingScope({ userId: 'owner-1' }, 'unit-1');

/**
 * Stateful in-memory fake of IInventoryRepository. Models the load-bearing DB semantics the mocked
 * service test must exercise:
 *  - `findBy*` return SNAPSHOTS (copies), so a stale read + atomic CAS is reproduced faithfully.
 *  - `decrementForCogs` is an ATOMIC compare-and-set against LIVE state (no await between the
 *    qtyOnHand≥qty check and the mutation) — the JS event loop makes it indivisible, mirroring the
 *    SQLite `updateMany where qtyOnHand ≥ qty`.
 *  - `createMovement` enforces the `@@unique([inventoryItemId,kind,sourceType,sourceId])` backstop
 *    (throws P2002) so an accidental double-append surfaces instead of silently corrupting the tie-out.
 */
class FakeInventoryRepo implements IInventoryRepository {
  items = new Map<string, InventoryItem>();
  movements: StockMovement[] = [];
  private itemSeq = 0;
  private movSeq = 0;

  private snapshotItem(it: InventoryItem): InventoryItem {
    return { ...it };
  }

  async create(data: CreateInventoryItemData): Promise<InventoryItem> {
    // @@unique(userId,unitId,productRef) — D-a.
    for (const it of this.items.values()) {
      if (it.userId === data.userId && it.unitId === data.unitId && it.productRef === data.productRef && !it.deletedAt) {
        throw this.p2002(['userId', 'unitId', 'productRef']);
      }
    }
    const item: InventoryItem = {
      id: `item-${++this.itemSeq}`,
      userId: data.userId,
      unitId: data.unitId,
      productRef: data.productRef,
      description: data.description,
      qtyOnHand: data.qtyOnHand,
      totalValueCents: data.totalValueCents,
      status: data.status,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    } as InventoryItem;
    this.items.set(item.id, item);
    return this.snapshotItem(item);
  }

  async findByProductRef(s: typeof scope, productRef: string): Promise<InventoryItem | null> {
    for (const it of this.items.values()) {
      if (it.userId === s.ownerUserId && it.unitId === s.unitId && it.productRef === productRef && !it.deletedAt) {
        return this.snapshotItem(it);
      }
    }
    return null;
  }

  async findById(s: typeof scope, id: string): Promise<InventoryItem | null> {
    const it = this.items.get(id);
    if (!it || it.userId !== s.ownerUserId || it.unitId !== s.unitId || it.deletedAt) return null;
    return this.snapshotItem(it);
  }

  async findManyByUnit(
    s: typeof scope,
    params: { status?: string; skip: number; limit: number },
  ): Promise<{ items: InventoryItem[]; total: number }> {
    const all = [...this.items.values()].filter(
      (it) => it.userId === s.ownerUserId && it.unitId === s.unitId && !it.deletedAt && (!params.status || it.status === params.status),
    );
    return { items: all.slice(params.skip, params.skip + params.limit).map((it) => this.snapshotItem(it)), total: all.length };
  }

  async findAllActive(s: typeof scope): Promise<InventoryItem[]> {
    return [...this.items.values()]
      .filter((it) => it.userId === s.ownerUserId && it.unitId === s.unitId && !it.deletedAt)
      .map((it) => this.snapshotItem(it));
  }

  async updateItem(s: typeof scope, id: string, data: Prisma.InventoryItemUpdateInput): Promise<InventoryItem> {
    const it = this.items.get(id);
    if (!it) throw new Error('not found');
    if (typeof data.qtyOnHand === 'number') it.qtyOnHand = data.qtyOnHand;
    if (typeof data.totalValueCents === 'number') it.totalValueCents = data.totalValueCents;
    it.updatedAt = new Date();
    return this.snapshotItem(it);
  }

  async createMovement(data: CreateStockMovementData): Promise<StockMovement> {
    const dup = this.movements.find(
      (m) => m.inventoryItemId === data.inventoryItemId && m.kind === data.kind && m.sourceType === data.sourceType && m.sourceId === data.sourceId,
    );
    if (dup) throw this.p2002(['inventoryItemId', 'kind', 'sourceType', 'sourceId']);
    const mov: StockMovement = {
      id: `mov-${++this.movSeq}`,
      inventoryItemId: data.inventoryItemId,
      kind: data.kind,
      qtyDelta: data.qtyDelta,
      valueCentsDelta: data.valueCentsDelta,
      occurredAt: data.occurredAt,
      sourceType: data.sourceType,
      sourceId: data.sourceId,
      entryId: data.entryId,
      createdAt: new Date(),
    } as StockMovement;
    this.movements.push(mov);
    return { ...mov };
  }

  async findMovementBySource(_s: typeof scope, key: MovementSourceKey): Promise<StockMovement | null> {
    const m = this.movements.find(
      (mm) => mm.inventoryItemId === key.inventoryItemId && mm.kind === key.kind && mm.sourceType === key.sourceType && mm.sourceId === key.sourceId,
    );
    return m ? { ...m } : null;
  }

  async findMovementsBySource(_s: typeof scope, query: MovementSourceQuery): Promise<StockMovement[]> {
    return this.movements
      .filter((m) => m.kind === query.kind && m.sourceType === query.sourceType && m.sourceId === query.sourceId)
      .map((m) => ({ ...m }));
  }

  async findMovementsByItem(_s: typeof scope, inventoryItemId: string): Promise<StockMovement[]> {
    return this.movements.filter((m) => m.inventoryItemId === inventoryItemId).map((m) => ({ ...m }));
  }

  async decrementForCogs(s: typeof scope, id: string, qty: number, valueCentsDelta: number): Promise<number> {
    // ATOMIC CAS — no await between the guard and the mutation (indivisible on the JS event loop).
    const it = this.items.get(id);
    if (!it || it.userId !== s.ownerUserId || it.unitId !== s.unitId || it.deletedAt || it.qtyOnHand < qty) {
      return 0;
    }
    it.qtyOnHand -= qty;
    it.totalValueCents -= valueCentsDelta;
    return 1;
  }

  async incrementForInbound(s: typeof scope, id: string, qty: number, valueCentsDelta: number): Promise<number> {
    const it = this.items.get(id);
    if (!it || it.userId !== s.ownerUserId || it.unitId !== s.unitId || it.deletedAt) return 0;
    it.qtyOnHand += qty;
    it.totalValueCents += valueCentsDelta;
    return 1;
  }

  async runTransaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return fn({} as Prisma.TransactionClient);
  }

  private p2002(target: string[]): Error {
    // Surfaces an accidental double-create / double-append loudly (the @@unique backstop). The
    // service's ensureItem P2002 recovery is exercised by the real-DB integration test, not here.
    const err = new Error('Unique constraint failed') as Error & { code: string; meta: unknown };
    err.code = 'P2002';
    err.meta = { target };
    return err;
  }
}

function build(over: { canManage?: boolean; canRead?: boolean } = {}) {
  const repo = new FakeInventoryRepo();
  const auditService = { append: jest.fn(async () => undefined) };
  const policy = {
    canManageInventory: () => over.canManage ?? true,
    canReadInventory: () => over.canRead ?? true,
  };
  const service = new InventoryService(
    repo as never,
    {} as never, // accountRepo — unused in the subledger-only body
    {} as never, // posting — unused in the subledger-only body
    auditService as never,
    policy as never,
  );
  return { service, repo, auditService };
}

const D = new Date('2026-07-10');

beforeEach(() => jest.clearAllMocks());

describe('InventoryService.receiveStock — INBOUND + moving average (D3/D6)', () => {
  it('books an INBOUND movement and recomputes the snapshot; emits inventory.received', async () => {
    const { service, repo, auditService } = build();
    const res = await service.receiveStock(scope, {
      productRef: 'sku-1', qty: 10, totalValueCents: 1000, occurredAt: D,
      sourceType: INVENTORY_INBOUND_SOURCE_TYPE, sourceId: 'seed-1',
    });
    expect(res.valueCents).toBe(1000);
    const item = await repo.findByProductRef(scope, 'sku-1');
    expect(item).toMatchObject({ qtyOnHand: 10, totalValueCents: 1000 });
    expect(repo.movements.filter((m) => m.kind === 'INBOUND')).toHaveLength(1);
    expect(auditService.append).toHaveBeenCalledTimes(1);
  });

  it('rejects a non-manager (Forbidden) and a non-integer/negative value', async () => {
    const forbidden = build({ canManage: false });
    await expect(
      forbidden.service.receiveStock(scope, { productRef: 'x', qty: 1, totalValueCents: 1, occurredAt: D, sourceType: INVENTORY_INBOUND_SOURCE_TYPE, sourceId: 's' }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    const { service } = build();
    await expect(
      service.receiveStock(scope, { productRef: 'x', qty: 0, totalValueCents: 1, occurredAt: D, sourceType: INVENTORY_INBOUND_SOURCE_TYPE, sourceId: 's' }),
    ).rejects.toBeInstanceOf(ValidationError);
    await expect(
      service.receiveStock(scope, { productRef: 'x', qty: 1, totalValueCents: -5, occurredAt: D, sourceType: INVENTORY_INBOUND_SOURCE_TYPE, sourceId: 's' }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('Gate 2 / D6 — tie-out over non-exact costs', () => {
  it('Σ StockMovement.valueCentsDelta == InventoryItem.totalValueCents through a long sequence', async () => {
    const { service, repo } = build();
    // Non-dividing costs so the moving average never lands on an integer.
    await service.receiveStock(scope, { productRef: 'sku', qty: 3, totalValueCents: 1000, occurredAt: D, sourceType: INVENTORY_INBOUND_SOURCE_TYPE, sourceId: 'in-1' });
    await service.recordSaleCogs(scope, { saleId: 'sale-1', unitId: 'unit-1', occurredAt: D, lines: [{ productRef: 'sku', qty: 1 }] });
    await service.receiveStock(scope, { productRef: 'sku', qty: 7, totalValueCents: 333, occurredAt: D, sourceType: INVENTORY_INBOUND_SOURCE_TYPE, sourceId: 'in-2' });
    await service.recordSaleCogs(scope, { saleId: 'sale-2', unitId: 'unit-1', occurredAt: D, lines: [{ productRef: 'sku', qty: 2 }] });
    await service.recordSaleCogs(scope, { saleId: 'sale-3', unitId: 'unit-1', occurredAt: D, lines: [{ productRef: 'sku', qty: 4 }] });

    const item = await repo.findByProductRef(scope, 'sku');
    const sumValue = repo.movements.reduce((a, m) => a + m.valueCentsDelta, 0);
    const sumQty = repo.movements.reduce((a, m) => a + m.qtyDelta, 0);
    expect(sumValue).toBe(item!.totalValueCents); // tie-out holds despite rounding residue
    expect(sumQty).toBe(item!.qtyOnHand);
    expect(item!.qtyOnHand).toBeGreaterThanOrEqual(0);
  });
});

describe('Gate 1 / D4 — TOCTOU: two concurrent baixas of one SKU', () => {
  it('exactly one wins, one rejects "estoque insuficiente"; qtyOnHand never negative', async () => {
    const { service, repo } = build();
    await service.receiveStock(scope, { productRef: 'sku', qty: 10, totalValueCents: 1000, occurredAt: D, sourceType: INVENTORY_INBOUND_SOURCE_TYPE, sourceId: 'in-1' });

    const results = await Promise.allSettled([
      service.recordSaleCogs(scope, { saleId: 'sale-A', unitId: 'unit-1', occurredAt: D, lines: [{ productRef: 'sku', qty: 6 }] }),
      service.recordSaleCogs(scope, { saleId: 'sale-B', unitId: 'unit-1', occurredAt: D, lines: [{ productRef: 'sku', qty: 6 }] }),
    ]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(ValidationError);

    const item = await repo.findByProductRef(scope, 'sku');
    expect(item!.qtyOnHand).toBe(4); // 10 − 6, never negative
    expect(repo.movements.filter((m) => m.kind === 'COGS')).toHaveLength(1);
  });
});

describe('Gate 5 / Gap 3 — idempotency by replay (no second decrement/increment)', () => {
  it('receiveStock replay of the same sourceId returns existing cents WITHOUT a second increment', async () => {
    const { service, repo, auditService } = build();
    const first = await service.receiveStock(scope, { productRef: 'sku', qty: 5, totalValueCents: 500, occurredAt: D, sourceType: INVENTORY_INBOUND_SOURCE_TYPE, sourceId: 'pay-1' });
    const replay = await service.receiveStock(scope, { productRef: 'sku', qty: 5, totalValueCents: 500, occurredAt: D, sourceType: INVENTORY_INBOUND_SOURCE_TYPE, sourceId: 'pay-1' });
    expect(first.valueCents).toBe(500);
    expect(replay.valueCents).toBe(500);
    const item = await repo.findByProductRef(scope, 'sku');
    expect(item).toMatchObject({ qtyOnHand: 5, totalValueCents: 500 }); // valued ONCE
    expect(repo.movements.filter((m) => m.kind === 'INBOUND')).toHaveLength(1);
    expect(auditService.append).toHaveBeenCalledTimes(1); // no second inventory.received
  });

  it('recordSaleCogs replay of the same saleId returns existing cents WITHOUT a second decrement', async () => {
    const { service, repo } = build();
    await service.receiveStock(scope, { productRef: 'sku', qty: 10, totalValueCents: 1000, occurredAt: D, sourceType: INVENTORY_INBOUND_SOURCE_TYPE, sourceId: 'in-1' });
    const first = await service.recordSaleCogs(scope, { saleId: 'sale-1', unitId: 'unit-1', occurredAt: D, lines: [{ productRef: 'sku', qty: 4 }] });
    const replay = await service.recordSaleCogs(scope, { saleId: 'sale-1', unitId: 'unit-1', occurredAt: D, lines: [{ productRef: 'sku', qty: 4 }] });
    expect(first.totalCogsCents).toBe(400);
    expect(replay.totalCogsCents).toBe(400); // same cents on replay
    const item = await repo.findByProductRef(scope, 'sku');
    expect(item!.qtyOnHand).toBe(6); // decremented ONCE (10 − 4)
    expect(repo.movements.filter((m) => m.kind === 'COGS')).toHaveLength(1);
  });
});

describe('multi-item + aggregation', () => {
  it('books one COGS movement per distinct product; aggregates duplicate product lines', async () => {
    const { service, repo } = build();
    await service.receiveStock(scope, { productRef: 'a', qty: 10, totalValueCents: 1000, occurredAt: D, sourceType: INVENTORY_INBOUND_SOURCE_TYPE, sourceId: 'in-a' });
    await service.receiveStock(scope, { productRef: 'b', qty: 10, totalValueCents: 2000, occurredAt: D, sourceType: INVENTORY_INBOUND_SOURCE_TYPE, sourceId: 'in-b' });
    const res = await service.recordSaleCogs(scope, {
      saleId: 'sale-1', unitId: 'unit-1', occurredAt: D,
      lines: [{ productRef: 'a', qty: 2 }, { productRef: 'b', qty: 1 }, { productRef: 'a', qty: 1 }],
    });
    // a: 3 units @ avg 100 = 300; b: 1 @ 200 = 200
    expect(res.totalCogsCents).toBe(500);
    expect(repo.movements.filter((m) => m.kind === 'COGS')).toHaveLength(2);
    const a = await repo.findByProductRef(scope, 'a');
    expect(a!.qtyOnHand).toBe(7); // aggregated 3 taken from 10
  });

  it('rejects a sale of a product with no valued stock', async () => {
    const { service } = build();
    await expect(
      service.recordSaleCogs(scope, { saleId: 's', unitId: 'unit-1', occurredAt: D, lines: [{ productRef: 'ghost', qty: 1 }] }),
    ).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('Gate 6 / D8 — estorno re-credits at ORIGINAL baixa cost', () => {
  it('reverses at the original COGS cost even after the average moved; idempotent by reversalEventId', async () => {
    const { service, repo, auditService } = build();
    // Buy 10 @ total 1000 (avg 100), sell 4 → COGS 400.
    await service.receiveStock(scope, { productRef: 'sku', qty: 10, totalValueCents: 1000, occurredAt: D, sourceType: INVENTORY_INBOUND_SOURCE_TYPE, sourceId: 'in-1' });
    const sale = await service.recordSaleCogs(scope, { saleId: 'sale-1', unitId: 'unit-1', occurredAt: D, lines: [{ productRef: 'sku', qty: 4 }] });
    expect(sale.totalCogsCents).toBe(400);
    // Buy more cheaply so the CURRENT average drops well below the original baixa cost.
    await service.receiveStock(scope, { productRef: 'sku', qty: 6, totalValueCents: 60, occurredAt: D, sourceType: INVENTORY_INBOUND_SOURCE_TYPE, sourceId: 'in-2' });

    const rev = await service.reverseStockForSale(scope, { saleId: 'sale-1', reversalEventId: 'rev-1', reversalDate: D });
    expect(rev.totalReversedCents).toBe(400); // ORIGINAL 400, not the cheaper current average

    const reversal = repo.movements.find((m) => m.kind === 'REVERSAL');
    expect(reversal).toMatchObject({ qtyDelta: 4, valueCentsDelta: 400 });
    expect(auditService.append).toHaveBeenCalledWith(
      expect.anything(),
      scope,
      expect.objectContaining({ eventType: 'inventory.reversed' }),
    );

    // Replay of the estorno is a no-op (idempotent by reversalEventId) — no second REVERSAL.
    const auditCalls = auditService.append.mock.calls.length;
    const replay = await service.reverseStockForSale(scope, { saleId: 'sale-1', reversalEventId: 'rev-1', reversalDate: D });
    expect(replay.totalReversedCents).toBe(400);
    expect(repo.movements.filter((m) => m.kind === 'REVERSAL')).toHaveLength(1);
    expect(auditService.append.mock.calls.length).toBe(auditCalls); // no second inventory.reversed
  });
});

describe('reconcileInventory — tie-out safety net (D6)', () => {
  it('repairs a drifted snapshot from the movement log; a consistent item is a no-op', async () => {
    const { service, repo } = build();
    await service.receiveStock(scope, { productRef: 'sku', qty: 10, totalValueCents: 1000, occurredAt: D, sourceType: INVENTORY_INBOUND_SOURCE_TYPE, sourceId: 'in-1' });

    // Consistent → no repair.
    const clean = await service.reconcileInventory(scope);
    expect(clean).toEqual({ itemsChecked: 1, itemsRepaired: 0 });

    // Corrupt the snapshot behind the service's back; reconcile rebuilds it from Σ movements.
    const item = [...repo.items.values()][0];
    item.qtyOnHand = 999;
    item.totalValueCents = 999999;
    const repaired = await service.reconcileInventory(scope);
    expect(repaired).toEqual({ itemsChecked: 1, itemsRepaired: 1 });
    const fixed = await repo.findByProductRef(scope, 'sku');
    expect(fixed).toMatchObject({ qtyOnHand: 10, totalValueCents: 1000 });
  });
});
