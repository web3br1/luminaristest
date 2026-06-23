import prisma from '../../../lib/prisma';
import type { Account, Prisma } from 'generated/prisma';
import type { CreateAccountInput, IAccountRepository } from './IAccountRepository';

/**
 * Prisma-backed repository for the chart of accounts (`accounts`). Only place with
 * prisma.account.* access. Two-level tenancy: every query filters userId + unitId.
 * Soft-delete universal — reads filter deletedAt: null, delete is an update of deletedAt.
 */
export class AccountRepository implements IAccountRepository {
  public async create(data: CreateAccountInput, tx?: Prisma.TransactionClient): Promise<Account> {
    return (tx ?? prisma).account.create({ data });
  }

  public async findByCode(
    userId: string,
    unitId: string,
    code: string,
    tx?: Prisma.TransactionClient,
  ): Promise<Account | null> {
    return (tx ?? prisma).account.findFirst({
      where: { userId, unitId, code, deletedAt: null },
    });
  }

  public async restoreByCode(
    userId: string,
    unitId: string,
    code: string,
    tx?: Prisma.TransactionClient,
  ): Promise<Account | null> {
    const client = tx ?? prisma;
    // Find the soft-deleted row holding this code (the @@unique is on raw columns, so a
    // soft-deleted row still owns the code and blocks re-create with P2002).
    const deleted = await client.account.findFirst({
      where: { userId, unitId, code, deletedAt: { not: null } },
    });
    if (!deleted) return null;
    return client.account.update({
      where: { id: deleted.id },
      data: { deletedAt: null },
    });
  }

  public async findManyByUnit(userId: string, unitId: string): Promise<Account[]> {
    return prisma.account.findMany({
      where: { userId, unitId, deletedAt: null },
      orderBy: { code: 'asc' },
    });
  }

  public async softDelete(userId: string, unitId: string, id: string): Promise<Account> {
    return prisma.account.update({
      where: { id, userId, unitId },
      data: { deletedAt: new Date() },
    });
  }
}
