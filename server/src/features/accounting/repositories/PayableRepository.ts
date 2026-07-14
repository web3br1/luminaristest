import prisma from '../../../lib/prisma';
import type { Payable, PayablePayment, Prisma } from 'generated/prisma';
import type { AccountingScope } from '../scope/AccountingScope';
import { accountingScopeWhere } from '../scope/AccountingScope';
import type {
  CreatePayableData,
  CreatePaymentData,
  IPayableRepository,
  PayableWithPayments,
} from './IPayableRepository';

/**
 * Prisma-backed repository for Contas a Pagar. Only place with `prisma.payable.*` /
 * `prisma.payablePayment.*` access. Tenancy is two-level via AccountingScope (ownerUserId +
 * unitId). Payables soft-delete (reads filter `deletedAt: null`); payments use a status flip
 * (`ACTIVE|CANCELLED`), no soft-delete column.
 */
export class PayableRepository implements IPayableRepository {
  public async create(data: CreatePayableData, tx?: Prisma.TransactionClient): Promise<Payable> {
    return (tx ?? prisma).payable.create({ data });
  }

  public async findById(
    scope: AccountingScope,
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<Payable | null> {
    return (tx ?? prisma).payable.findFirst({
      where: { id, ...accountingScopeWhere(scope), deletedAt: null },
    });
  }

  public async findByIdWithPayments(
    scope: AccountingScope,
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<PayableWithPayments | null> {
    return (tx ?? prisma).payable.findFirst({
      where: { id, ...accountingScopeWhere(scope), deletedAt: null },
      include: { payments: true },
    });
  }

  public async findManyByUnit(
    scope: AccountingScope,
    params: { status?: string; skip: number; limit: number },
  ): Promise<{ payables: PayableWithPayments[]; total: number }> {
    const where = { ...accountingScopeWhere(scope), deletedAt: null, ...(params.status ? { status: params.status } : {}) };
    const [payables, total] = await Promise.all([
      prisma.payable.findMany({
        where,
        include: { payments: true },
        orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
        skip: params.skip,
        take: params.limit,
      }),
      prisma.payable.count({ where }),
    ]);
    return { payables, total };
  }

  public async findAllActive(scope: AccountingScope, tx?: Prisma.TransactionClient): Promise<Payable[]> {
    return (tx ?? prisma).payable.findMany({
      where: { ...accountingScopeWhere(scope), deletedAt: null },
    });
  }

  public async claimForPayment(
    scope: AccountingScope,
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<number> {
    // Atomic conditional transition OPEN → PAYING. `updateMany` matches only when the row is
    // still OPEN, so two concurrent callers race on THIS single-row write and exactly one gets
    // count===1 (D4). Scoped by owner+unit so it can never touch another tenant's row.
    const result = await (tx ?? prisma).payable.updateMany({
      where: { id, ...accountingScopeWhere(scope), status: 'OPEN', deletedAt: null },
      data: { status: 'PAYING' },
    });
    return result.count;
  }

  public async markPaidIfPaying(
    scope: AccountingScope,
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<number> {
    // Atomic conditional transition PAYING → PAID (mirror of claimForPayment). Matches only when
    // the row is still PAYING, so of N concurrent finalizers (a raced reconcile + the normal
    // registerPayment, or two reconcile passes) exactly one gets count===1 and thus emits the
    // payable.payment_registered audit exactly once.
    const result = await (tx ?? prisma).payable.updateMany({
      where: { id, ...accountingScopeWhere(scope), status: 'PAYING' },
      data: { status: 'PAID' },
    });
    return result.count;
  }

  public async updatePayable(
    scope: AccountingScope,
    id: string,
    data: Prisma.PayableUpdateInput,
    tx?: Prisma.TransactionClient,
  ): Promise<Payable> {
    const { userId, unitId } = accountingScopeWhere(scope);
    return (tx ?? prisma).payable.update({ where: { id, userId, unitId }, data });
  }

  public async createPayment(
    data: CreatePaymentData,
    tx?: Prisma.TransactionClient,
  ): Promise<PayablePayment> {
    return (tx ?? prisma).payablePayment.create({ data });
  }

  public async findPaymentById(
    scope: AccountingScope,
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<PayablePayment | null> {
    return (tx ?? prisma).payablePayment.findFirst({
      where: { id, ...accountingScopeWhere(scope) },
    });
  }

  public async findActivePayment(
    scope: AccountingScope,
    payableId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<PayablePayment | null> {
    return (tx ?? prisma).payablePayment.findFirst({
      where: { ...accountingScopeWhere(scope), payableId, status: 'ACTIVE' },
    });
  }

  public async findAllActivePayments(
    scope: AccountingScope,
    tx?: Prisma.TransactionClient,
  ): Promise<PayablePayment[]> {
    return (tx ?? prisma).payablePayment.findMany({
      where: { ...accountingScopeWhere(scope), status: 'ACTIVE' },
    });
  }

  public async updatePayment(
    scope: AccountingScope,
    id: string,
    data: Prisma.PayablePaymentUpdateInput,
    tx?: Prisma.TransactionClient,
  ): Promise<PayablePayment> {
    const { userId, unitId } = accountingScopeWhere(scope);
    return (tx ?? prisma).payablePayment.update({ where: { id, userId, unitId }, data });
  }

  public async runTransaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return prisma.$transaction(fn);
  }
}
