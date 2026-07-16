import prisma from '../../../lib/prisma';
import type { DimensionDefinition, DimensionValue, PostingDimension, Prisma } from 'generated/prisma';
import type { AccountingScope } from '../scope/AccountingScope';
import { accountingScopeWhere } from '../scope/AccountingScope';
import type {
  CreateDimensionDefinitionData,
  CreateDimensionValueData,
  CreatePostingDimensionData,
  IDimensionRepository,
} from './IDimensionRepository';

/**
 * Prisma-backed repository for the dimension catalog (INCR-DIM). Only place with
 * `prisma.dimensionDefinition.*` / `prisma.dimensionValue.*` access. Tenancy is two-level via
 * AccountingScope. Soft-archive: reads default to `deletedAt: null` unless includeArchived.
 */
export class DimensionRepository implements IDimensionRepository {
  // ── Definitions ────────────────────────────────────────────────────────────
  public async createDefinition(
    data: CreateDimensionDefinitionData,
    tx?: Prisma.TransactionClient,
  ): Promise<DimensionDefinition> {
    return (tx ?? prisma).dimensionDefinition.create({ data });
  }

  public async findDefinitionById(
    scope: AccountingScope,
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<DimensionDefinition | null> {
    return (tx ?? prisma).dimensionDefinition.findFirst({
      where: { id, ...accountingScopeWhere(scope) },
    });
  }

  public async findManyDefinitions(
    scope: AccountingScope,
    params: { includeArchived: boolean },
    tx?: Prisma.TransactionClient,
  ): Promise<DimensionDefinition[]> {
    return (tx ?? prisma).dimensionDefinition.findMany({
      where: { ...accountingScopeWhere(scope), ...(params.includeArchived ? {} : { deletedAt: null }) },
      orderBy: [{ code: 'asc' }],
    });
  }

  public async updateDefinition(
    scope: AccountingScope,
    id: string,
    data: Prisma.DimensionDefinitionUpdateInput,
    tx?: Prisma.TransactionClient,
  ): Promise<DimensionDefinition> {
    const { userId, unitId } = accountingScopeWhere(scope);
    return (tx ?? prisma).dimensionDefinition.update({ where: { id, userId, unitId }, data });
  }

  public async countActiveValues(
    scope: AccountingScope,
    definitionId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<number> {
    return (tx ?? prisma).dimensionValue.count({
      where: { ...accountingScopeWhere(scope), definitionId, deletedAt: null },
    });
  }

  // ── Values ─────────────────────────────────────────────────────────────────
  public async createValue(
    data: CreateDimensionValueData,
    tx?: Prisma.TransactionClient,
  ): Promise<DimensionValue> {
    return (tx ?? prisma).dimensionValue.create({ data });
  }

  public async findValueById(
    scope: AccountingScope,
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<DimensionValue | null> {
    return (tx ?? prisma).dimensionValue.findFirst({
      where: { id, ...accountingScopeWhere(scope) },
    });
  }

  public async findManyValues(
    scope: AccountingScope,
    params: { definitionId?: string; includeArchived: boolean },
    tx?: Prisma.TransactionClient,
  ): Promise<DimensionValue[]> {
    return (tx ?? prisma).dimensionValue.findMany({
      where: {
        ...accountingScopeWhere(scope),
        ...(params.definitionId ? { definitionId: params.definitionId } : {}),
        ...(params.includeArchived ? {} : { deletedAt: null }),
      },
      orderBy: [{ definitionId: 'asc' }, { code: 'asc' }],
    });
  }

  public async updateValue(
    scope: AccountingScope,
    id: string,
    data: Prisma.DimensionValueUpdateInput,
    tx?: Prisma.TransactionClient,
  ): Promise<DimensionValue> {
    const { userId, unitId } = accountingScopeWhere(scope);
    return (tx ?? prisma).dimensionValue.update({ where: { id, userId, unitId }, data });
  }

  public async countActiveChildren(
    scope: AccountingScope,
    parentId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<number> {
    return (tx ?? prisma).dimensionValue.count({
      where: { ...accountingScopeWhere(scope), parentId, deletedAt: null },
    });
  }

  // ── Posting↔value bridge ─────────────────────────────────────────────────
  public async createPostingDimension(
    data: CreatePostingDimensionData,
    tx?: Prisma.TransactionClient,
  ): Promise<PostingDimension> {
    return (tx ?? prisma).postingDimension.create({ data });
  }

  public async findPostingDimensions(
    scope: AccountingScope,
    postingId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<PostingDimension[]> {
    return (tx ?? prisma).postingDimension.findMany({
      where: { ...accountingScopeWhere(scope), postingId },
      orderBy: [{ definitionId: 'asc' }],
    });
  }

  public async runTransaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    return prisma.$transaction(fn);
  }
}
