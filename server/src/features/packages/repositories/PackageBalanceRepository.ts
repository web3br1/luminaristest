import prisma from '../../../lib/prisma';
import type { CustomerPackageBalance, PackageBalanceMovement, Prisma } from 'generated/prisma';
import type { AccountingScope } from '../../accounting/scope/AccountingScope';
import { accountingScopeWhere } from '../../accounting/scope/AccountingScope';
import type {
  CreateMovementInput,
  IPackageBalanceRepository,
  PackageMovementKind,
} from './IPackageBalanceRepository';

/**
 * Prisma-backed repository for prepaid-package balances. Only place with
 * prisma.customerPackageBalance.* / prisma.packageBalanceMovement.* access. Money is
 * INTEGER CENTS. `tryDecrement` pushes the balanceCents >= 0 guard down to a single
 * conditional SQL UPDATE — atomic and race-free, no read-modify-write.
 */
export class PackageBalanceRepository implements IPackageBalanceRepository {
  public async findBalance(
    scope: AccountingScope,
    customerId: string,
    packageId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<CustomerPackageBalance | null> {
    return (tx ?? prisma).customerPackageBalance.findFirst({
      where: { ...accountingScopeWhere(scope), customerId, packageId, deletedAt: null },
    });
  }

  public async listBalances(
    scope: AccountingScope,
    customerId?: string,
  ): Promise<CustomerPackageBalance[]> {
    return prisma.customerPackageBalance.findMany({
      where: {
        ...accountingScopeWhere(scope),
        ...(customerId ? { customerId } : {}),
        deletedAt: null,
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  public async upsertCredit(
    scope: AccountingScope,
    customerId: string,
    packageId: string,
    amountCents: number,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    const { userId, unitId } = accountingScopeWhere(scope);
    await (tx ?? prisma).customerPackageBalance.upsert({
      where: { userId_unitId_customerId_packageId: { userId, unitId, customerId, packageId } },
      create: { userId, unitId, customerId, packageId, balanceCents: amountCents },
      update: { balanceCents: { increment: amountCents } },
    });
  }

  public async tryDecrement(
    scope: AccountingScope,
    customerId: string,
    packageId: string,
    amountCents: number,
    tx?: Prisma.TransactionClient,
  ): Promise<boolean> {
    const { count } = await (tx ?? prisma).customerPackageBalance.updateMany({
      where: {
        ...accountingScopeWhere(scope),
        customerId,
        packageId,
        deletedAt: null,
        balanceCents: { gte: amountCents }, // the >= 0 invariant, enforced atomically in SQL
      },
      data: { balanceCents: { decrement: amountCents } },
    });
    return count === 1;
  }

  public async findMovement(
    scope: AccountingScope,
    saleId: string,
    kind: PackageMovementKind,
    tx?: Prisma.TransactionClient,
  ): Promise<PackageBalanceMovement | null> {
    const { userId, unitId } = accountingScopeWhere(scope);
    return (tx ?? prisma).packageBalanceMovement.findUnique({
      where: { userId_unitId_saleId_kind: { userId, unitId, saleId, kind } },
    });
  }

  public async createMovement(
    data: CreateMovementInput,
    tx?: Prisma.TransactionClient,
  ): Promise<PackageBalanceMovement> {
    return (tx ?? prisma).packageBalanceMovement.create({ data });
  }

  public async runTransaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return prisma.$transaction(fn);
  }
}
