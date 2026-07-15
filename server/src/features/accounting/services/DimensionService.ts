import { ForbiddenError, NotFoundError, ValidationError } from '../../../lib/errors';
import { Prisma } from 'generated/prisma';
import type { DimensionDefinition, DimensionValue } from 'generated/prisma';
import {
  DIMENSION_DEFINITION_ARCHIVED,
  DIMENSION_DEFINITION_CREATED,
  DIMENSION_VALUE_ARCHIVED,
  DIMENSION_VALUE_CREATED,
} from '../models/Dimension.model';
import type {
  ArchiveDimensionInput,
  CreateDimensionDefinitionInput,
  CreateDimensionValueInput,
  ListDimensionsQueryInput,
} from '../dtos/DimensionDto';
import type { IDimensionRepository } from '../repositories/IDimensionRepository';
import type { IAccountingPolicy } from '../policies/IAccountingPolicy';
import type { AuditService } from './AuditService';
import type { AccountingScope } from '../scope/AccountingScope';
import { accountingScopeWhere } from '../scope/AccountingScope';

/** A definition with its values (flat list carrying parentId — the tree is in the data). */
export interface DimensionCatalogEntry {
  definition: DimensionDefinition;
  values: DimensionValue[];
}

/**
 * DimensionService — dimension catalog (INCR-DIM / ADR-INCR-DIM). FIRST-CLASS PRISMA (F1→a). Pure
 * catalog CRUD: it manages the AXES (definitions) and their hierarchical VALUES, and NEVER posts to
 * the ledger (a dimension is metadata — ACC-024). The posting-time tagging lives in PostingService
 * (Fatia 2); the dimension-sliced reports live in AccountingReportService (Fatia 3).
 *
 * Invariants proved here:
 * - ACC-026: a value's parent MUST belong to the SAME axis (cross-axis parent rejected). A cycle is
 *   structurally impossible on create (a fresh value has no children), so create only checks same-axis.
 * - Archive is soft (status ARCHIVED + deletedAt) and PRESERVES historical PostingDimension links; an
 *   axis with active values / a value with active children cannot be archived (clean removal order).
 * - Every catalog state change emits an AuditEvent in the SAME tx (T8).
 */
export class DimensionService {
  constructor(
    private readonly dimensionRepo: IDimensionRepository,
    private readonly auditService: AuditService,
    private readonly policy: IAccountingPolicy,
  ) {}

  // ── Reads ────────────────────────────────────────────────────────────────
  async listCatalog(scope: AccountingScope, params: ListDimensionsQueryInput): Promise<DimensionCatalogEntry[]> {
    if (!this.policy.canReadDimension(scope)) {
      throw new ForbiddenError('Você não tem permissão para ler dimensões.');
    }
    const definitions = await this.dimensionRepo.findManyDefinitions(scope, {
      includeArchived: params.includeArchived,
    });
    const allValues = await this.dimensionRepo.findManyValues(scope, {
      includeArchived: params.includeArchived,
    });
    return definitions.map((definition) => ({
      definition,
      values: allValues.filter((v) => v.definitionId === definition.id),
    }));
  }

  // ── Definitions ──────────────────────────────────────────────────────────
  async createDefinition(
    scope: AccountingScope,
    dto: CreateDimensionDefinitionInput,
  ): Promise<DimensionDefinition> {
    if (!this.policy.canManageDimension(scope)) {
      throw new ForbiddenError('Você não tem permissão para gerir dimensões.');
    }
    const { userId, unitId } = accountingScopeWhere(scope);
    try {
      return await this.dimensionRepo.runTransaction(async (tx) => {
        const created = await this.dimensionRepo.createDefinition(
          { userId, unitId, code: dto.code, name: dto.name, status: 'ACTIVE', createdById: scope.actorUserId },
          tx,
        );
        await this.auditService.append(tx, scope, {
          actorUserId: scope.actorUserId,
          eventType: DIMENSION_DEFINITION_CREATED,
          targetType: 'dimension_definition',
          targetId: created.id,
          payload: { definitionId: created.id, code: created.code, name: created.name },
        });
        return created;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ValidationError(`Já existe um eixo de dimensão com o código '${dto.code}' nesta unidade.`);
      }
      throw error;
    }
  }

  async archiveDefinition(
    scope: AccountingScope,
    definitionId: string,
    _dto: ArchiveDimensionInput,
  ): Promise<DimensionDefinition> {
    if (!this.policy.canManageDimension(scope)) {
      throw new ForbiddenError('Você não tem permissão para gerir dimensões.');
    }
    const definition = await this.dimensionRepo.findDefinitionById(scope, definitionId);
    if (!definition) throw new NotFoundError(`Eixo de dimensão '${definitionId}' não foi encontrado.`);
    if (definition.status === 'ARCHIVED') return definition; // idempotent

    // Clean removal order: archive the values first (an axis with live values would leave orphan tags
    // reachable in the picker). This is a guard, not a cascade — the operator empties the axis first.
    // ponytail: pre-tx guard, best-effort — a createValue racing this archive could slip a value under
    // an axis mid-archive. Benign (recoverable CATALOG state, never a ledger/money corruption — the tag
    // is metadata, ACC-024) and near-impossible under single-process SQLite (T11). Upgrade path if
    // multi-writer ever lands: move the count + update into one tx AND re-check axis status in createValue's tx.
    const activeValues = await this.dimensionRepo.countActiveValues(scope, definitionId);
    if (activeValues > 0) {
      throw new ValidationError('Arquive os valores do eixo antes de arquivar o eixo.');
    }

    return this.dimensionRepo.runTransaction(async (tx) => {
      const archived = await this.dimensionRepo.updateDefinition(
        scope,
        definitionId,
        { status: 'ARCHIVED', deletedAt: new Date() },
        tx,
      );
      await this.auditService.append(tx, scope, {
        actorUserId: scope.actorUserId,
        eventType: DIMENSION_DEFINITION_ARCHIVED,
        targetType: 'dimension_definition',
        targetId: definitionId,
        payload: { definitionId, code: definition.code },
      });
      return archived;
    });
  }

  // ── Values ───────────────────────────────────────────────────────────────
  async createValue(scope: AccountingScope, dto: CreateDimensionValueInput): Promise<DimensionValue> {
    if (!this.policy.canManageDimension(scope)) {
      throw new ForbiddenError('Você não tem permissão para gerir dimensões.');
    }
    const { userId, unitId } = accountingScopeWhere(scope);

    // The axis must exist and be ACTIVE (no adding values to an archived axis).
    const definition = await this.dimensionRepo.findDefinitionById(scope, dto.definitionId);
    if (!definition) throw new NotFoundError(`Eixo de dimensão '${dto.definitionId}' não foi encontrado.`);
    if (definition.status !== 'ACTIVE') {
      throw new ValidationError('Não é possível adicionar valores a um eixo arquivado.');
    }

    // Parent gate (ACC-026): must exist, be active, and belong to the SAME axis. A cycle is
    // impossible on create (this value has no children yet), so same-axis is the only structural check.
    if (dto.parentId) {
      const parent = await this.dimensionRepo.findValueById(scope, dto.parentId);
      if (!parent) throw new NotFoundError(`Valor-pai '${dto.parentId}' não foi encontrado.`);
      if (parent.definitionId !== dto.definitionId) {
        throw new ValidationError('O valor-pai deve pertencer ao mesmo eixo de dimensão (ACC-026).');
      }
      if (parent.status !== 'ACTIVE') {
        throw new ValidationError('O valor-pai está arquivado.');
      }
    }

    try {
      return await this.dimensionRepo.runTransaction(async (tx) => {
        const created = await this.dimensionRepo.createValue(
          {
            userId,
            unitId,
            definitionId: dto.definitionId,
            code: dto.code,
            name: dto.name,
            parentId: dto.parentId ?? null,
            status: 'ACTIVE',
            createdById: scope.actorUserId,
          },
          tx,
        );
        await this.auditService.append(tx, scope, {
          actorUserId: scope.actorUserId,
          eventType: DIMENSION_VALUE_CREATED,
          targetType: 'dimension_value',
          targetId: created.id,
          payload: {
            definitionId: created.definitionId,
            valueId: created.id,
            code: created.code,
            name: created.name,
            parentId: created.parentId,
          },
        });
        return created;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ValidationError(`Já existe um valor com o código '${dto.code}' neste eixo.`);
      }
      throw error;
    }
  }

  async archiveValue(
    scope: AccountingScope,
    valueId: string,
    _dto: ArchiveDimensionInput,
  ): Promise<DimensionValue> {
    if (!this.policy.canManageDimension(scope)) {
      throw new ForbiddenError('Você não tem permissão para gerir dimensões.');
    }
    const value = await this.dimensionRepo.findValueById(scope, valueId);
    if (!value) throw new NotFoundError(`Valor de dimensão '${valueId}' não foi encontrado.`);
    if (value.status === 'ARCHIVED') return value; // idempotent

    // Orphan guard: a value with active children cannot be archived (rollup would break). Archived
    // value KEEPS its historical PostingDimension links (D2 — the trail never disappears).
    // ponytail: pre-tx guard, best-effort — same benign catalog TOCTOU as archiveDefinition (a child
    // created mid-archive); never a ledger corruption (ACC-024), non-issue under single-process (T11).
    const activeChildren = await this.dimensionRepo.countActiveChildren(scope, valueId);
    if (activeChildren > 0) {
      throw new ValidationError('Arquive os valores-filho antes de arquivar este valor.');
    }

    return this.dimensionRepo.runTransaction(async (tx) => {
      const archived = await this.dimensionRepo.updateValue(
        scope,
        valueId,
        { status: 'ARCHIVED', deletedAt: new Date() },
        tx,
      );
      await this.auditService.append(tx, scope, {
        actorUserId: scope.actorUserId,
        eventType: DIMENSION_VALUE_ARCHIVED,
        targetType: 'dimension_value',
        targetId: valueId,
        payload: { definitionId: value.definitionId, valueId, code: value.code },
      });
      return archived;
    });
  }
}
