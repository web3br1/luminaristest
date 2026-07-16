import prisma from '../../../lib/prisma';
import type { Counterparty, Prisma } from 'generated/prisma';
import type { AccountingScope } from '../scope/AccountingScope';
import { accountingScopeWhere } from '../scope/AccountingScope';
import type { CreateCounterpartyData, ICounterpartyRepository } from './ICounterpartyRepository';

/**
 * Prisma-backed repository for the counterparty catalog. Only place with `prisma.counterparty.*`
 * access. Tenancy is two-level via AccountingScope (ownerUserId + unitId) — `findById`/`findManyByUnit`
 * always carry the scope where-clause, so a cross-tenant id resolves to null (SEC-A1-1/SEC-A1-3).
 * Soft-archive: reads default to `deletedAt: null` unless includeArchived.
 */
export class CounterpartyRepository implements ICounterpartyRepository {
  public async create(data: CreateCounterpartyData, tx?: Prisma.TransactionClient): Promise<Counterparty> {
    return (tx ?? prisma).counterparty.create({ data });
  }

  public async findById(
    scope: AccountingScope,
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<Counterparty | null> {
    return (tx ?? prisma).counterparty.findFirst({
      where: { id, ...accountingScopeWhere(scope), deletedAt: null },
    });
  }

  public async findManyByUnit(
    scope: AccountingScope,
    params: { type?: string; includeArchived: boolean },
    tx?: Prisma.TransactionClient,
  ): Promise<Counterparty[]> {
    return (tx ?? prisma).counterparty.findMany({
      where: {
        ...accountingScopeWhere(scope),
        ...(params.type ? { type: params.type } : {}),
        ...(params.includeArchived ? {} : { deletedAt: null }),
      },
      orderBy: [{ type: 'asc' }, { name: 'asc' }],
    });
  }

  public async update(
    scope: AccountingScope,
    id: string,
    data: Prisma.CounterpartyUpdateInput,
    tx?: Prisma.TransactionClient,
  ): Promise<Counterparty> {
    const { userId, unitId } = accountingScopeWhere(scope);
    return (tx ?? prisma).counterparty.update({ where: { id, userId, unitId }, data });
  }

  public async runTransaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return prisma.$transaction(fn);
  }
}
