import prisma from '../../../lib/prisma';
import type { Posting, Prisma } from 'generated/prisma';
import type { AccountingScope } from '../scope/AccountingScope';
import { accountingScopeWhere } from '../scope/AccountingScope';
import type {
  AccountDimensionTotals,
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

  public async deleteByEntryId(
    scope: AccountingScope,
    entryId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    await (tx ?? prisma).posting.deleteMany({
      where: { entryId, ...accountingScopeWhere(scope) },
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
    options?: { from?: Date; to?: Date; excludeSourceTypes?: string[] },
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
    const sourceTypeFilter =
      options?.excludeSourceTypes && options.excludeSourceTypes.length > 0
        ? { sourceType: { notIn: options.excludeSourceTypes } }
        : {};
    const grouped = await prisma.posting.groupBy({
      by: ['accountId'],
      where: {
        ...accountingScopeWhere(scope),
        entry: { status: { in: statuses }, ...dateFilter, ...sourceTypeFilter },
      },
      _sum: { debitCents: true, creditCents: true },
    });

    return grouped.map((row) => ({
      accountId: row.accountId,
      debitCents: row._sum.debitCents ?? 0,
      creditCents: row._sum.creditCents ?? 0,
    }));
  }

  public async groupByAccountAndDimension(
    scope: AccountingScope,
    statuses: string[],
    options: { definitionId: string; from?: Date; to?: Date; excludeSourceTypes?: string[] },
  ): Promise<AccountDimensionTotals[]> {
    const dateFilter =
      options.from || options.to
        ? { date: { ...(options.from ? { gte: options.from } : {}), ...(options.to ? { lte: options.to } : {}) } }
        : {};
    const sourceTypeFilter =
      options.excludeSourceTypes && options.excludeSourceTypes.length > 0
        ? { sourceType: { notIn: options.excludeSourceTypes } }
        : {};
    // Prisma groupBy can't cross the posting_dimensions bridge, so fetch legs + their tag for THIS
    // axis and reduce in-memory (D5). @@unique([postingId,definitionId]) guarantees ≤1 tag per leg
    // per axis, so `dimensions[0]` is unambiguous; an untagged leg falls into valueId=null.
    const postings = await prisma.posting.findMany({
      where: {
        ...accountingScopeWhere(scope),
        entry: { status: { in: statuses }, ...dateFilter, ...sourceTypeFilter },
      },
      select: {
        accountId: true,
        debitCents: true,
        creditCents: true,
        dimensions: { where: { definitionId: options.definitionId }, select: { valueId: true } },
      },
    });
    const map = new Map<string, AccountDimensionTotals>();
    for (const p of postings) {
      const valueId = p.dimensions[0]?.valueId ?? null;
      const key = `${p.accountId}::${valueId ?? '__NONE__'}`;
      const cur = map.get(key) ?? { accountId: p.accountId, valueId, debitCents: 0, creditCents: 0 };
      cur.debitCents += p.debitCents;
      cur.creditCents += p.creditCents;
      map.set(key, cur);
    }
    return [...map.values()];
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
