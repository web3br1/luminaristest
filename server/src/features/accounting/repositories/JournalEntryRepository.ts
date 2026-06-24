import prisma from '../../../lib/prisma';
import type { JournalEntry, Prisma } from 'generated/prisma';
import { NotFoundError } from '../../../lib/errors';
import type {
  CreateJournalEntryInput,
  IJournalEntryRepository,
  JournalEntryWithFullPostings,
  JournalEntryWithPostings,
} from './IJournalEntryRepository';

/**
 * Prisma-backed repository for journal-entry headers (`journal_entries`). Only place
 * with prisma.journalEntry.* access. Two-level tenancy: every read filters userId + unitId.
 * No soft-delete here — posted entries are immutable, corrections happen via reversal.
 */
export class JournalEntryRepository implements IJournalEntryRepository {
  public async create(
    data: CreateJournalEntryInput,
    tx?: Prisma.TransactionClient,
  ): Promise<JournalEntry> {
    return (tx ?? prisma).journalEntry.create({
      data: {
        userId: data.userId,
        unitId: data.unitId,
        date: data.date,
        description: data.description,
        status: data.status,
        sourceType: data.sourceType,
        sourceId: data.sourceId ?? null,
      },
    });
  }

  public async findById(
    userId: string,
    unitId: string,
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<JournalEntryWithPostings | null> {
    return (tx ?? prisma).journalEntry.findFirst({
      where: { id, userId, unitId },
      include: { postings: true },
    });
  }

  public async findBySource(
    userId: string,
    unitId: string,
    sourceType: string,
    sourceId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<JournalEntryWithPostings | null> {
    return (tx ?? prisma).journalEntry.findFirst({
      where: { userId, unitId, sourceType, sourceId },
      include: { postings: true },
    });
  }

  public async setStatus(
    userId: string,
    unitId: string,
    id: string,
    status: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    // updateMany so the WHERE can carry userId+unitId (update() rejects non-unique filters).
    // A 0-row result means the id is not this tenant's — fail loud instead of silently no-op.
    const { count } = await (tx ?? prisma).journalEntry.updateMany({
      where: { id, userId, unitId },
      data: { status },
    });
    if (count === 0) {
      throw new NotFoundError(`Lançamento '${id}' não encontrado para atualizar status.`);
    }
  }

  public async setReversedBy(
    userId: string,
    unitId: string,
    id: string,
    reversedById: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const { count } = await (tx ?? prisma).journalEntry.updateMany({
      where: { id, userId, unitId },
      data: { reversedById },
    });
    if (count === 0) {
      throw new NotFoundError(`Lançamento '${id}' não encontrado para vincular estorno.`);
    }
  }

  public async findManyByUnit(
    userId: string,
    unitId: string,
    skip: number,
    take: number,
  ): Promise<{ entries: JournalEntryWithFullPostings[]; total: number }> {
    const [entries, total] = await Promise.all([
      prisma.journalEntry.findMany({
        where: { userId, unitId },
        orderBy: { date: 'desc' },
        skip,
        take,
        include: {
          postings: {
            include: { account: { select: { code: true, name: true } } },
          },
        },
      }),
      prisma.journalEntry.count({ where: { userId, unitId } }),
    ]);
    return { entries: entries as JournalEntryWithFullPostings[], total };
  }
}
