import prisma from '../../../lib/prisma';
import type { AccountingPeriod, AccountingPeriodStatus, Prisma } from 'generated/prisma';
import type { AccountingScope } from '../scope/AccountingScope';
import { accountingScopeWhere } from '../scope/AccountingScope';
import type { IAccountingPeriodRepository } from './IAccountingPeriodRepository';

export class AccountingPeriodRepository implements IAccountingPeriodRepository {
  public async findByYearMonth(
    scope: AccountingScope,
    year: number,
    month: number,
    tx?: Prisma.TransactionClient,
  ): Promise<AccountingPeriod | null> {
    return (tx ?? prisma).accountingPeriod.findUnique({
      where: { userId_unitId_year_month: { ...accountingScopeWhere(scope), year, month } },
    });
  }

  public async findById(
    scope: AccountingScope,
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<AccountingPeriod | null> {
    return (tx ?? prisma).accountingPeriod.findFirst({
      where: { id, ...accountingScopeWhere(scope) },
    });
  }

  public async seedYear(
    scope: AccountingScope,
    year: number,
    tx?: Prisma.TransactionClient,
  ): Promise<AccountingPeriod[]> {
    const { userId, unitId } = accountingScopeWhere(scope);
    const client = tx ?? prisma;

    // ponytail: upsert 12x — createMany.skipDuplicates not supported on SQLite
    for (let m = 1; m <= 12; m++) {
      await client.accountingPeriod.upsert({
        where: { userId_unitId_year_month: { userId, unitId, year, month: m } },
        create: { userId, unitId, year, month: m, status: 'FUTURE' },
        update: {},
      });
    }

    return client.accountingPeriod.findMany({
      where: { ...accountingScopeWhere(scope), year },
      orderBy: { month: 'asc' },
    });
  }

  public async setStatus(
    scope: AccountingScope,
    year: number,
    month: number,
    nextStatus: AccountingPeriodStatus,
    actorUserId: string,
    reason: string | undefined,
    tx: Prisma.TransactionClient,
    fromStatus?: AccountingPeriodStatus | null,
  ): Promise<AccountingPeriod> {
    const { userId, unitId } = accountingScopeWhere(scope);

    const isOpening = nextStatus === 'OPEN';
    const isClosing = nextStatus === 'SOFT_CLOSED' || nextStatus === 'HARD_CLOSED';

    const updated = await tx.accountingPeriod.update({
      where: { userId_unitId_year_month: { userId, unitId, year, month } },
      data: {
        status: nextStatus,
        ...(isOpening ? { openedAt: new Date(), openedById: actorUserId } : {}),
        ...(isClosing ? { closedAt: new Date(), closedById: actorUserId } : {}),
      },
    });

    await tx.accountingPeriodTransition.create({
      data: {
        userId,
        unitId,
        periodId: updated.id,
        fromStatus: fromStatus ?? null,
        toStatus: nextStatus,
        actorUserId,
        reason: reason ?? null,
      },
    });

    return updated;
  }

  public async list(scope: AccountingScope, year: number): Promise<AccountingPeriod[]> {
    return prisma.accountingPeriod.findMany({
      where: { ...accountingScopeWhere(scope), year },
      orderBy: { month: 'asc' },
    });
  }
}
