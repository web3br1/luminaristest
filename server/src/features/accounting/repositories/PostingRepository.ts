import prisma from '../../../lib/prisma';
import type { Posting, Prisma } from 'generated/prisma';
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
    userId: string,
    unitId: string,
    entryId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<Posting[]> {
    return (tx ?? prisma).posting.findMany({
      where: { entryId, userId, unitId },
      orderBy: { createdAt: 'asc' },
    });
  }

  public async findByAccount(
    userId: string,
    unitId: string,
    accountId: string,
  ): Promise<Posting[]> {
    return prisma.posting.findMany({
      where: { userId, unitId, accountId },
      orderBy: { createdAt: 'asc' },
    });
  }

  public async groupByAccount(
    userId: string,
    unitId: string,
    statuses: string[],
  ): Promise<AccountPostingTotals[]> {
    const grouped = await prisma.posting.groupBy({
      by: ['accountId'],
      where: { userId, unitId, entry: { status: { in: statuses } } },
      _sum: { debitCents: true, creditCents: true },
    });

    return grouped.map((row) => ({
      accountId: row.accountId,
      debitCents: row._sum.debitCents ?? 0,
      creditCents: row._sum.creditCents ?? 0,
    }));
  }
}
