import prisma from '../../../lib/prisma';
import type { Receivable, ReceivableReceipt, Prisma } from 'generated/prisma';
import type { AccountingScope } from '../scope/AccountingScope';
import { accountingScopeWhere } from '../scope/AccountingScope';
import { RECEIVABLE_OUTSTANDING_STATUSES } from '../models/Receivable.model';
import type {
  CreateReceivableData,
  CreateReceiptData,
  IReceivableRepository,
  ReceivableWithReceipts,
} from './IReceivableRepository';

/**
 * Prisma-backed repository for Contas a Receber. Only place with `prisma.receivable.*` /
 * `prisma.receivableReceipt.*` access. Tenancy is two-level via AccountingScope (ownerUserId +
 * unitId). Receivables soft-delete (reads filter `deletedAt: null`); receipts use a status flip
 * (`ACTIVE|CANCELLED`), no soft-delete column. MIRROR of PayableRepository.
 */
export class ReceivableRepository implements IReceivableRepository {
  public async create(data: CreateReceivableData, tx?: Prisma.TransactionClient): Promise<Receivable> {
    return (tx ?? prisma).receivable.create({ data });
  }

  public async findById(
    scope: AccountingScope,
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<Receivable | null> {
    return (tx ?? prisma).receivable.findFirst({
      where: { id, ...accountingScopeWhere(scope), deletedAt: null },
    });
  }

  public async findByIdWithReceipts(
    scope: AccountingScope,
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<ReceivableWithReceipts | null> {
    return (tx ?? prisma).receivable.findFirst({
      where: { id, ...accountingScopeWhere(scope), deletedAt: null },
      include: { receipts: true },
    });
  }

  public async findManyByUnit(
    scope: AccountingScope,
    params: { status?: string; skip: number; limit: number },
  ): Promise<{ receivables: ReceivableWithReceipts[]; total: number }> {
    const where = { ...accountingScopeWhere(scope), deletedAt: null, ...(params.status ? { status: params.status } : {}) };
    const [receivables, total] = await Promise.all([
      prisma.receivable.findMany({
        where,
        include: { receipts: true },
        orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
        skip: params.skip,
        take: params.limit,
      }),
      prisma.receivable.count({ where }),
    ]);
    return { receivables, total };
  }

  public async findAllActive(scope: AccountingScope, tx?: Prisma.TransactionClient): Promise<Receivable[]> {
    return (tx ?? prisma).receivable.findMany({
      where: { ...accountingScopeWhere(scope), deletedAt: null },
    });
  }

  public async findOutstanding(scope: AccountingScope, tx?: Prisma.TransactionClient): Promise<Receivable[]> {
    return (tx ?? prisma).receivable.findMany({
      where: {
        ...accountingScopeWhere(scope),
        deletedAt: null,
        status: { in: [...RECEIVABLE_OUTSTANDING_STATUSES] },
      },
      orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
    });
  }

  public async claimForReceipt(
    scope: AccountingScope,
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<number> {
    // Atomic conditional transition OPEN → RECEIVING. `updateMany` matches only when the row is
    // still OPEN, so two concurrent callers race on THIS single-row write and exactly one gets
    // count===1 (D4). Scoped by owner+unit so it can never touch another tenant's row.
    const result = await (tx ?? prisma).receivable.updateMany({
      where: { id, ...accountingScopeWhere(scope), status: 'OPEN', deletedAt: null },
      data: { status: 'RECEIVING' },
    });
    return result.count;
  }

  public async markReceivedIfReceiving(
    scope: AccountingScope,
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<number> {
    // Atomic conditional transition RECEIVING → RECEIVED (mirror of claimForReceipt). Matches only
    // when the row is still RECEIVING, so of N concurrent finalizers (a raced reconcile + the normal
    // registerReceipt, or two reconcile passes) exactly one gets count===1 and thus emits the
    // receivable.receipt_registered audit exactly once.
    const result = await (tx ?? prisma).receivable.updateMany({
      where: { id, ...accountingScopeWhere(scope), status: 'RECEIVING' },
      data: { status: 'RECEIVED' },
    });
    return result.count;
  }

  public async updateReceivable(
    scope: AccountingScope,
    id: string,
    data: Prisma.ReceivableUpdateInput,
    tx?: Prisma.TransactionClient,
  ): Promise<Receivable> {
    const { userId, unitId } = accountingScopeWhere(scope);
    return (tx ?? prisma).receivable.update({ where: { id, userId, unitId }, data });
  }

  public async createReceipt(
    data: CreateReceiptData,
    tx?: Prisma.TransactionClient,
  ): Promise<ReceivableReceipt> {
    return (tx ?? prisma).receivableReceipt.create({ data });
  }

  public async findReceiptById(
    scope: AccountingScope,
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<ReceivableReceipt | null> {
    return (tx ?? prisma).receivableReceipt.findFirst({
      where: { id, ...accountingScopeWhere(scope) },
    });
  }

  public async findActiveReceipt(
    scope: AccountingScope,
    receivableId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<ReceivableReceipt | null> {
    return (tx ?? prisma).receivableReceipt.findFirst({
      where: { ...accountingScopeWhere(scope), receivableId, status: 'ACTIVE' },
    });
  }

  public async findAllActiveReceipts(
    scope: AccountingScope,
    tx?: Prisma.TransactionClient,
  ): Promise<ReceivableReceipt[]> {
    return (tx ?? prisma).receivableReceipt.findMany({
      where: { ...accountingScopeWhere(scope), status: 'ACTIVE' },
    });
  }

  public async updateReceipt(
    scope: AccountingScope,
    id: string,
    data: Prisma.ReceivableReceiptUpdateInput,
    tx?: Prisma.TransactionClient,
  ): Promise<ReceivableReceipt> {
    const { userId, unitId } = accountingScopeWhere(scope);
    return (tx ?? prisma).receivableReceipt.update({ where: { id, userId, unitId }, data });
  }

  public async runTransaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return prisma.$transaction(fn);
  }
}
