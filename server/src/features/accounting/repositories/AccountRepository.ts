import prisma from '../../../lib/prisma';
import type { Account, Prisma } from 'generated/prisma';
import type { AccountingScope } from '../scope/AccountingScope';
import { accountingScopeWhere } from '../scope/AccountingScope';
import type { CreateAccountInput, IAccountRepository } from './IAccountRepository';

/**
 * Prisma-backed repository for the chart of accounts (`accounts`). Only place with
 * prisma.account.* access. Tenancy is two-level via AccountingScope (ownerUserId + unitId).
 * Soft-delete universal — reads filter deletedAt: null, delete is an update of deletedAt.
 */
export class AccountRepository implements IAccountRepository {
  public async create(data: CreateAccountInput, tx?: Prisma.TransactionClient): Promise<Account> {
    return (tx ?? prisma).account.create({ data });
  }

  public async findByCode(
    scope: AccountingScope,
    code: string,
    tx?: Prisma.TransactionClient,
  ): Promise<Account | null> {
    return (tx ?? prisma).account.findFirst({
      where: { ...accountingScopeWhere(scope), code, deletedAt: null },
    });
  }

  public async restoreByCode(
    scope: AccountingScope,
    code: string,
    tx?: Prisma.TransactionClient,
  ): Promise<Account | null> {
    const client = tx ?? prisma;
    const where = accountingScopeWhere(scope);
    // Find the soft-deleted row holding this code (the @@unique is on raw columns, so a
    // soft-deleted row still owns the code and blocks re-create with P2002).
    const deleted = await client.account.findFirst({
      where: { ...where, code, deletedAt: { not: null } },
    });
    if (!deleted) return null;
    return client.account.update({
      where: { id: deleted.id },
      data: { deletedAt: null },
    });
  }

  public async findById(
    scope: AccountingScope,
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<Account | null> {
    return (tx ?? prisma).account.findFirst({
      where: { id, ...accountingScopeWhere(scope), deletedAt: null },
    });
  }

  public async findManyByUnit(scope: AccountingScope): Promise<Account[]> {
    return prisma.account.findMany({
      where: { ...accountingScopeWhere(scope), deletedAt: null },
      orderBy: { code: 'asc' },
    });
  }

  public async softDelete(scope: AccountingScope, id: string, tx?: Prisma.TransactionClient): Promise<Account> {
    const { userId, unitId } = accountingScopeWhere(scope);
    return (tx ?? prisma).account.update({
      where: { id, userId, unitId },
      data: { deletedAt: new Date() },
    });
  }
}
