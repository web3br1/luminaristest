import type { DimensionDefinition, DimensionValue, PostingDimension, Prisma } from 'generated/prisma';
import type { AccountingScope } from '../scope/AccountingScope';

/** Data to create a dimension definition (axis). */
export interface CreateDimensionDefinitionData {
  userId: string;
  unitId: string;
  code: string;
  name: string;
  status: string;
  createdById: string | null;
}

/** Data to create a dimension value (node in an axis). */
export interface CreateDimensionValueData {
  userId: string;
  unitId: string;
  definitionId: string;
  code: string;
  name: string;
  parentId: string | null;
  status: string;
  createdById: string | null;
}

/** Data to tag a posting leg with a dimension value (the bridge row). */
export interface CreatePostingDimensionData {
  userId: string;
  unitId: string;
  postingId: string;
  definitionId: string;
  valueId: string;
}

/**
 * Repository contract for the dimension catalog (INCR-DIM). Only place with
 * `prisma.dimensionDefinition.*` / `prisma.dimensionValue.*` access. Tenancy is two-level via
 * AccountingScope (ownerUserId + unitId). Both entities soft-archive (status ARCHIVED + deletedAt);
 * reads default to active (deletedAt: null) unless includeArchived. Tx-aware (every write accepts an
 * optional tx so audit + write commit atomically — T6/T8).
 */
export interface IDimensionRepository {
  // Definitions
  createDefinition(data: CreateDimensionDefinitionData, tx?: Prisma.TransactionClient): Promise<DimensionDefinition>;
  findDefinitionById(scope: AccountingScope, id: string, tx?: Prisma.TransactionClient): Promise<DimensionDefinition | null>;
  findManyDefinitions(scope: AccountingScope, params: { includeArchived: boolean }, tx?: Prisma.TransactionClient): Promise<DimensionDefinition[]>;
  updateDefinition(scope: AccountingScope, id: string, data: Prisma.DimensionDefinitionUpdateInput, tx?: Prisma.TransactionClient): Promise<DimensionDefinition>;
  countActiveValues(scope: AccountingScope, definitionId: string, tx?: Prisma.TransactionClient): Promise<number>;

  // Values
  createValue(data: CreateDimensionValueData, tx?: Prisma.TransactionClient): Promise<DimensionValue>;
  findValueById(scope: AccountingScope, id: string, tx?: Prisma.TransactionClient): Promise<DimensionValue | null>;
  findManyValues(scope: AccountingScope, params: { definitionId?: string; includeArchived: boolean }, tx?: Prisma.TransactionClient): Promise<DimensionValue[]>;
  updateValue(scope: AccountingScope, id: string, data: Prisma.DimensionValueUpdateInput, tx?: Prisma.TransactionClient): Promise<DimensionValue>;
  countActiveChildren(scope: AccountingScope, parentId: string, tx?: Prisma.TransactionClient): Promise<number>;

  // Posting↔value bridge (written by PostingService inside the post tx — Fatia 2)
  createPostingDimension(data: CreatePostingDimensionData, tx?: Prisma.TransactionClient): Promise<PostingDimension>;

  /**
   * Lists the dimension tags of ONE posting leg (INCR-DIM-COMPLETENESS SEC-B1-2). reverseEntry uses
   * it to COPY the original leg's tags onto the mirror leg so the reversal is dimensionally identical
   * to the original (dimensional reconciliation + it satisfies the completeness gate for the mirror
   * without re-authoring). Scoped via AccountingScope; tx-aware so the copy commits atomically.
   */
  findPostingDimensions(scope: AccountingScope, postingId: string, tx?: Prisma.TransactionClient): Promise<PostingDimension[]>;

  runTransaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T>;
}
