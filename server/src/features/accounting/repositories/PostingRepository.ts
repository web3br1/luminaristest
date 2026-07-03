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
 * Prisma-backed repository for ledger lines (`postings`). Money is INTEGER CENTS
 * (Int columns) — groupByAccount sums those Int columns exactly, never floats.
 * (ReconciliationRepository also READS prisma.posting for its domain queries —
 * BE-INCR-7; this repo remains the only WRITE surface for postings.)
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
    options?: { from?: Date; to?: Date },
  ): Promise<AccountPostingTotals[]> {
    const dateFilter =
      options?.from || options?.to
        ? {
            date: {
              ...(options.from ? { gte: options.from } : {}),
              ...(options.to ? { lte: options.to } : {}),
            },
          }
        : {};
    const grouped = await prisma.posting.groupBy({
      by: ['accountId'],
      where: {
        ...accountingScopeWhere(scope),
        entry: { status: { in: statuses }, ...dateFilter },
      },
      _sum: { debitCents: true, creditCents: true },
    });

    return grouped.map((row) => ({
      accountId: row.accountId,
      debitCents: row._sum.debitCents ?? 0,
      creditCents: row._sum.creditCents ?? 0,
    }));
  }

  public async nextEntryNumber(
    scope: AccountingScope,
    fiscalYear: number,
    tx: Prisma.TransactionClient,
  ): Promise<number> {
    const { userId, unitId } = accountingScopeWhere(scope);
    const seq = await tx.journalEntrySequence.upsert({
      where: { userId_unitId_fiscalYear: { userId, unitId, fiscalYear } },
      create: { userId, unitId, fiscalYear, last: 1 },
      update: { last: { increment: 1 } },
      select: { last: true },
    });
    return seq.last;
  }

  public async runTransaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return prisma.$transaction(fn);
  }
}
