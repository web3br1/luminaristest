import prisma from '../../../lib/prisma';
import type { InventoryItem, StockMovement, Prisma } from 'generated/prisma';
import type { AccountingScope } from '../scope/AccountingScope';
import { accountingScopeWhere } from '../scope/AccountingScope';
import type {
  CreateInventoryItemData,
  CreateStockMovementData,
  IInventoryRepository,
  MovementSourceKey,
  MovementSourceQuery,
} from './IInventoryRepository';

/**
 * Prisma-backed repository for the perpetual inventory subledger. Only place with
 * `prisma.inventoryItem.*` / `prisma.stockMovement.*` access. Tenancy is two-level via
 * AccountingScope (ownerUserId + unitId). Items soft-delete (reads filter `deletedAt: null`);
 * movements are append-only. `StockMovement` carries no userId/unitId column — it is scope-guarded
 * through its parent `InventoryItem` (a relation filter), so a movement can never be read across
 * tenants.
 */
export class InventoryRepository implements IInventoryRepository {
  public async create(
    data: CreateInventoryItemData,
    tx?: Prisma.TransactionClient,
  ): Promise<InventoryItem> {
    return (tx ?? prisma).inventoryItem.create({ data });
  }

  public async findByProductRef(
    scope: AccountingScope,
    productRef: string,
    tx?: Prisma.TransactionClient,
  ): Promise<InventoryItem | null> {
    return (tx ?? prisma).inventoryItem.findFirst({
      where: { ...accountingScopeWhere(scope), productRef, deletedAt: null },
    });
  }

  public async findById(
    scope: AccountingScope,
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<InventoryItem | null> {
    return (tx ?? prisma).inventoryItem.findFirst({
      where: { id, ...accountingScopeWhere(scope), deletedAt: null },
    });
  }

  public async findManyByUnit(
    scope: AccountingScope,
    params: { status?: string; skip: number; limit: number },
  ): Promise<{ items: InventoryItem[]; total: number }> {
    const where = {
      ...accountingScopeWhere(scope),
      deletedAt: null,
      ...(params.status ? { status: params.status } : {}),
    };
    const [items, total] = await Promise.all([
      prisma.inventoryItem.findMany({
        where,
        orderBy: [{ productRef: 'asc' }, { createdAt: 'asc' }],
        skip: params.skip,
        take: params.limit,
      }),
      prisma.inventoryItem.count({ where }),
    ]);
    return { items, total };
  }

  public async findAllActive(
    scope: AccountingScope,
    tx?: Prisma.TransactionClient,
  ): Promise<InventoryItem[]> {
    return (tx ?? prisma).inventoryItem.findMany({
      where: { ...accountingScopeWhere(scope), deletedAt: null },
    });
  }

  public async updateItem(
    scope: AccountingScope,
    id: string,
    data: Prisma.InventoryItemUpdateInput,
    tx?: Prisma.TransactionClient,
  ): Promise<InventoryItem> {
    const { userId, unitId } = accountingScopeWhere(scope);
    return (tx ?? prisma).inventoryItem.update({ where: { id, userId, unitId }, data });
  }

  public async createMovement(
    data: CreateStockMovementData,
    tx?: Prisma.TransactionClient,
  ): Promise<StockMovement> {
    return (tx ?? prisma).stockMovement.create({ data });
  }

  public async findMovementBySource(
    scope: AccountingScope,
    key: MovementSourceKey,
    tx?: Prisma.TransactionClient,
  ): Promise<StockMovement | null> {
    // Scope-guarded through the parent item so a movement is never read cross-tenant even though
    // stock_movements carries no userId/unitId of its own.
    return (tx ?? prisma).stockMovement.findFirst({
      where: {
        inventoryItemId: key.inventoryItemId,
        kind: key.kind,
        sourceType: key.sourceType,
        sourceId: key.sourceId,
        inventoryItem: { ...accountingScopeWhere(scope), deletedAt: null },
      },
    });
  }

  public async findMovementsBySource(
    scope: AccountingScope,
    query: MovementSourceQuery,
    tx?: Prisma.TransactionClient,
  ): Promise<StockMovement[]> {
    return (tx ?? prisma).stockMovement.findMany({
      where: {
        kind: query.kind,
        sourceType: query.sourceType,
        sourceId: query.sourceId,
        inventoryItem: { ...accountingScopeWhere(scope), deletedAt: null },
      },
      orderBy: [{ occurredAt: 'asc' }, { createdAt: 'asc' }],
    });
  }

  public async findMovementsByItem(
    scope: AccountingScope,
    inventoryItemId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<StockMovement[]> {
    return (tx ?? prisma).stockMovement.findMany({
      where: {
        inventoryItemId,
        inventoryItem: { ...accountingScopeWhere(scope), deletedAt: null },
      },
      orderBy: [{ occurredAt: 'asc' }, { createdAt: 'asc' }],
    });
  }

  public async decrementForCogs(
    scope: AccountingScope,
    inventoryItemId: string,
    qty: number,
    valueCentsDelta: number,
    tx?: Prisma.TransactionClient,
  ): Promise<number> {
    // Atomic CAS (D4): match ONLY when there is enough stock, so of N concurrent baixas of the same
    // SKU exactly one gets count===1 and qtyOnHand can never cross zero. Scoped by owner+unit so it
    // can never touch another tenant's row. Mirror of PayableRepository.claimForPayment.
    const result = await (tx ?? prisma).inventoryItem.updateMany({
      where: {
        id: inventoryItemId,
        ...accountingScopeWhere(scope),
        deletedAt: null,
        qtyOnHand: { gte: qty },
      },
      data: {
        qtyOnHand: { decrement: qty },
        totalValueCents: { decrement: valueCentsDelta },
      },
    });
    return result.count;
  }

  public async incrementForInbound(
    scope: AccountingScope,
    inventoryItemId: string,
    qty: number,
    valueCentsDelta: number,
    tx?: Prisma.TransactionClient,
  ): Promise<number> {
    const result = await (tx ?? prisma).inventoryItem.updateMany({
      where: { id: inventoryItemId, ...accountingScopeWhere(scope), deletedAt: null },
      data: {
        qtyOnHand: { increment: qty },
        totalValueCents: { increment: valueCentsDelta },
      },
    });
    return result.count;
  }

  public async runTransaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return prisma.$transaction(fn);
  }
}
