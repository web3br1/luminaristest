import prisma from '../../../lib/prisma';
import type { ReferentialMapping, Prisma } from 'generated/prisma';
import type { AccountingScope } from '../scope/AccountingScope';
import { accountingScopeWhere } from '../scope/AccountingScope';
import type {
  IReferentialMappingRepository,
  SetReferentialMappingInput,
} from './IReferentialMappingRepository';

/**
 * Prisma-backed repository for referential mappings (`referential_mappings`).
 * Only place with prisma.referentialMapping.* access. Tenancy is two-level via
 * AccountingScope (ownerUserId + unitId). No soft-delete (D5): unset is a real
 * delete, so reads carry no deletedAt filter.
 */
export class ReferentialMappingRepository implements IReferentialMappingRepository {
  public async upsert(
    scope: AccountingScope,
    data: SetReferentialMappingInput,
    tx?: Prisma.TransactionClient,
  ): Promise<ReferentialMapping> {
    const { userId, unitId } = accountingScopeWhere(scope);
    return (tx ?? prisma).referentialMapping.upsert({
      where: {
        userId_unitId_accountId_mappingVersion: {
          userId,
          unitId,
          accountId: data.accountId,
          mappingVersion: data.mappingVersion,
        },
      },
      // update-in-place on re-set: refresh the referential code/label, keep identity.
      update: {
        referentialCode: data.referentialCode,
        label: data.label,
      },
      create: {
        userId,
        unitId,
        accountId: data.accountId,
        referentialCode: data.referentialCode,
        label: data.label,
        mappingVersion: data.mappingVersion,
        createdById: data.createdById,
      },
    });
  }

  public async deleteByAccountVersion(
    scope: AccountingScope,
    accountId: string,
    mappingVersion: string,
    tx?: Prisma.TransactionClient,
  ): Promise<number> {
    const { userId, unitId } = accountingScopeWhere(scope);
    const result = await (tx ?? prisma).referentialMapping.deleteMany({
      where: { userId, unitId, accountId, mappingVersion },
    });
    return result.count;
  }

  public async findByAccountAndVersion(
    scope: AccountingScope,
    accountId: string,
    mappingVersion: string,
    tx?: Prisma.TransactionClient,
  ): Promise<ReferentialMapping | null> {
    return (tx ?? prisma).referentialMapping.findFirst({
      where: { ...accountingScopeWhere(scope), accountId, mappingVersion },
    });
  }

  public async findManyByVersion(
    scope: AccountingScope,
    mappingVersion: string,
    tx?: Prisma.TransactionClient,
  ): Promise<ReferentialMapping[]> {
    return (tx ?? prisma).referentialMapping.findMany({
      where: { ...accountingScopeWhere(scope), mappingVersion },
      orderBy: { createdAt: 'asc' },
    });
  }

  public async runTransaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return prisma.$transaction(fn);
  }
}
