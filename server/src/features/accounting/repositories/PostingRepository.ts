import prisma from '../../../lib/prisma';
import type { Posting, Prisma } from 'generated/prisma';
import type { AccountingScope } from '../scope/AccountingScope';
import { accountingScopeWhere } from '../scope/AccountingScope';
import type {
  AccountPostingTotals,
  CreatePostingInput,
  IPostingRepository,
} from './IPostingRepository';

/**
 * Prisma-backed repository for ledger lines (`postings`). Only place with
 * prisma.posting.* access. Money is INTEGER CENTS (Int columns) — groupByAccount
 * sums those Int columns exactly, never floats.
 */
export class PostingRepository implements IPostingRepository {
  public async create(data: CreatePostingInput, tx?: Prisma.TransactionClient): Promise<Posting> {
    return (tx ?? prisma).posting.create({ data });
  }

  public async findByEntryId(
    scope: AccountingScope,
    entryId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<Posting[]> {
    return (tx ?? prisma).posting.findMany({
      where: { entryId, ...accountingScopeWhere(scope) },
      orderBy: { createdAt: 'asc' },
    });
  }

  public async findByAccount(scope: AccountingScope, accountId: string): Promise<Posting[]> {
    return prisma.posting.findMany({
      where: { ...accountingScopeWhere(scope), accountId },
      orderBy: { createdAt: 'asc' },
    });
  }

  public async groupByAccount(
    scope: AccountingScope,
    statuses: string[],
  ): Promise<AccountPostingTotals[]> {
    const grouped = await prisma.posting.groupBy({
      by: ['accountId'],
      where: { ...accountingScopeWhere(scope), entry: { status: { in: statuses } } },
      _sum: { debitCents: true, creditCents: true },
    });

    return grouped.map((row) => ({
      accountId: row.accountId,
      debitCents: row._sum.debitCents ?? 0,
      creditCents: row._sum.creditCents ?? 0,
    }));
  }

  public async runTransaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return prisma.$transaction(fn);
  }
}
