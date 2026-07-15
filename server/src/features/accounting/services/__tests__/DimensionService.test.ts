import { DimensionService } from '../DimensionService';
import { ForbiddenError, NotFoundError, ValidationError } from '../../../../lib/errors';
import { resolveAccountingScope } from '../../scope/AccountingScope';
import {
  DIMENSION_DEFINITION_ARCHIVED,
  DIMENSION_DEFINITION_CREATED,
  DIMENSION_VALUE_ARCHIVED,
  DIMENSION_VALUE_CREATED,
} from '../../models/Dimension.model';
import { Prisma } from 'generated/prisma';
import type { DimensionDefinition, DimensionValue } from 'generated/prisma';

const scope = resolveAccountingScope({ userId: 'owner-1' }, 'unit-1');

const P2002 = new Prisma.PrismaClientKnownRequestError('unique', { code: 'P2002', clientVersion: 'x' } as never);

function defRow(over: Partial<DimensionDefinition> = {}): DimensionDefinition {
  return {
    id: 'def-cc', userId: 'owner-1', unitId: 'unit-1', code: 'COST_CENTER', name: 'Centro de Custo',
    status: 'ACTIVE', createdById: 'owner-1', createdAt: new Date(), updatedAt: new Date(), deletedAt: null, ...over,
  } as DimensionDefinition;
}
function valRow(over: Partial<DimensionValue> = {}): DimensionValue {
  return {
    id: 'val-1', userId: 'owner-1', unitId: 'unit-1', definitionId: 'def-cc', code: 'LOJA_CENTRO',
    name: 'Loja Centro', parentId: null, status: 'ACTIVE', createdById: 'owner-1',
    createdAt: new Date(), updatedAt: new Date(), deletedAt: null, ...over,
  } as DimensionValue;
}

interface Opts {
  canManage?: boolean;
  canRead?: boolean;
  definition?: DimensionDefinition | null;
  parentValue?: DimensionValue | null;
  activeValues?: number;
  activeChildren?: number;
  createDefinitionThrows?: unknown;
  createValueThrows?: unknown;
}

function build(opts: Opts = {}) {
  const dimensionRepo = {
    createDefinition: jest.fn(async (data: Record<string, unknown>) => {
      if (opts.createDefinitionThrows) throw opts.createDefinitionThrows;
      return defRow({ id: 'def-new', ...data } as Partial<DimensionDefinition>);
    }),
    findDefinitionById: jest.fn(async () => (opts.definition === undefined ? defRow() : opts.definition)),
    findManyDefinitions: jest.fn(async () => [defRow()]),
    updateDefinition: jest.fn(async (_s, id: string, data: Record<string, unknown>) => defRow({ id, ...data } as Partial<DimensionDefinition>)),
    countActiveValues: jest.fn(async () => opts.activeValues ?? 0),
    createValue: jest.fn(async (data: Record<string, unknown>) => {
      if (opts.createValueThrows) throw opts.createValueThrows;
      return valRow({ id: 'val-new', ...data } as Partial<DimensionValue>);
    }),
    findValueById: jest.fn(async () => (opts.parentValue === undefined ? valRow() : opts.parentValue)),
    findManyValues: jest.fn(async () => [valRow()]),
    updateValue: jest.fn(async (_s, id: string, data: Record<string, unknown>) => valRow({ id, ...data } as Partial<DimensionValue>)),
    countActiveChildren: jest.fn(async () => opts.activeChildren ?? 0),
    createPostingDimension: jest.fn(),
    runTransaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({})),
  };
  const auditService = { append: jest.fn(async () => undefined) };
  const policy = {
    canManageDimension: () => opts.canManage ?? true,
    canReadDimension: () => opts.canRead ?? true,
  };
  const service = new DimensionService(dimensionRepo as never, auditService as never, policy as never);
  return { service, dimensionRepo, auditService };
}

describe('DimensionService.createDefinition', () => {
  it('creates the axis and audits definition_created in the same tx', async () => {
    const { service, dimensionRepo, auditService } = build();
    const out = await service.createDefinition(scope, { unitId: 'unit-1', code: 'COST_CENTER', name: 'Centro de Custo' });
    expect(out.id).toBe('def-new');
    expect(dimensionRepo.createDefinition).toHaveBeenCalledTimes(1);
    expect(auditService.append).toHaveBeenCalledWith(
      {}, scope, expect.objectContaining({ eventType: DIMENSION_DEFINITION_CREATED }),
    );
  });

  it('maps a P2002 (duplicate code) to a ValidationError', async () => {
    const { service } = build({ createDefinitionThrows: P2002 });
    await expect(service.createDefinition(scope, { unitId: 'unit-1', code: 'COST_CENTER', name: 'x' }))
      .rejects.toBeInstanceOf(ValidationError);
  });

  it('forbids without canManageDimension', async () => {
    const { service } = build({ canManage: false });
    await expect(service.createDefinition(scope, { unitId: 'unit-1', code: 'X', name: 'x' }))
      .rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('DimensionService.createValue', () => {
  it('creates a root value and audits value_created', async () => {
    const { service, auditService } = build();
    const out = await service.createValue(scope, { unitId: 'unit-1', definitionId: 'def-cc', code: 'LOJA', name: 'Loja' });
    expect(out.id).toBe('val-new');
    expect(auditService.append).toHaveBeenCalledWith(
      {}, scope, expect.objectContaining({ eventType: DIMENSION_VALUE_CREATED }),
    );
  });

  it('rejects when the axis does not exist', async () => {
    const { service } = build({ definition: null });
    await expect(service.createValue(scope, { unitId: 'unit-1', definitionId: 'ghost', code: 'X', name: 'x' }))
      .rejects.toBeInstanceOf(NotFoundError);
  });

  it('rejects adding a value to an ARCHIVED axis', async () => {
    const { service } = build({ definition: defRow({ status: 'ARCHIVED' }) });
    await expect(service.createValue(scope, { unitId: 'unit-1', definitionId: 'def-cc', code: 'X', name: 'x' }))
      .rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects a parent from a DIFFERENT axis (ACC-026)', async () => {
    const { service } = build({ parentValue: valRow({ id: 'p-other', definitionId: 'def-project' }) });
    await expect(service.createValue(scope, { unitId: 'unit-1', definitionId: 'def-cc', code: 'X', name: 'x', parentId: 'p-other' }))
      .rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects an archived parent', async () => {
    const { service } = build({ parentValue: valRow({ id: 'p1', definitionId: 'def-cc', status: 'ARCHIVED' }) });
    await expect(service.createValue(scope, { unitId: 'unit-1', definitionId: 'def-cc', code: 'X', name: 'x', parentId: 'p1' }))
      .rejects.toBeInstanceOf(ValidationError);
  });

  it('accepts a parent from the SAME axis', async () => {
    const { service } = build({ parentValue: valRow({ id: 'p1', definitionId: 'def-cc' }) });
    await expect(service.createValue(scope, { unitId: 'unit-1', definitionId: 'def-cc', code: 'X', name: 'x', parentId: 'p1' }))
      .resolves.toMatchObject({ id: 'val-new' });
  });

  it('maps a P2002 (duplicate value code) to a ValidationError', async () => {
    const { service } = build({ createValueThrows: P2002 });
    await expect(service.createValue(scope, { unitId: 'unit-1', definitionId: 'def-cc', code: 'LOJA', name: 'x' }))
      .rejects.toBeInstanceOf(ValidationError);
  });
});

describe('DimensionService.archiveValue', () => {
  it('rejects archiving a value that still has active children (orphan guard)', async () => {
    const { service } = build({ parentValue: valRow(), activeChildren: 2 });
    await expect(service.archiveValue(scope, 'val-1', { unitId: 'unit-1' }))
      .rejects.toBeInstanceOf(ValidationError);
  });

  it('archives a leaf value and audits value_archived', async () => {
    const { service, auditService, dimensionRepo } = build({ parentValue: valRow(), activeChildren: 0 });
    const out = await service.archiveValue(scope, 'val-1', { unitId: 'unit-1' });
    expect(out.status).toBe('ARCHIVED');
    expect(dimensionRepo.updateValue).toHaveBeenCalledWith(
      scope, 'val-1', expect.objectContaining({ status: 'ARCHIVED' }), {},
    );
    expect(auditService.append).toHaveBeenCalledWith(
      {}, scope, expect.objectContaining({ eventType: DIMENSION_VALUE_ARCHIVED }),
    );
  });

  it('is idempotent on an already-archived value', async () => {
    const { service, auditService } = build({ parentValue: valRow({ status: 'ARCHIVED' }) });
    await service.archiveValue(scope, 'val-1', { unitId: 'unit-1' });
    expect(auditService.append).not.toHaveBeenCalled();
  });

  it('404 when the value is not found', async () => {
    const { service } = build({ parentValue: null });
    await expect(service.archiveValue(scope, 'ghost', { unitId: 'unit-1' }))
      .rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('DimensionService.archiveDefinition', () => {
  it('rejects archiving an axis that still has active values', async () => {
    const { service } = build({ definition: defRow(), activeValues: 3 });
    await expect(service.archiveDefinition(scope, 'def-cc', { unitId: 'unit-1' }))
      .rejects.toBeInstanceOf(ValidationError);
  });

  it('archives an empty axis and audits definition_archived', async () => {
    const { service, auditService } = build({ definition: defRow(), activeValues: 0 });
    const out = await service.archiveDefinition(scope, 'def-cc', { unitId: 'unit-1' });
    expect(out.status).toBe('ARCHIVED');
    expect(auditService.append).toHaveBeenCalledWith(
      {}, scope, expect.objectContaining({ eventType: DIMENSION_DEFINITION_ARCHIVED }),
    );
  });
});

describe('DimensionService.listCatalog', () => {
  it('groups values under their definitions', async () => {
    const { service } = build();
    const out = await service.listCatalog(scope, { unitId: 'unit-1', includeArchived: false });
    expect(out).toHaveLength(1);
    expect(out[0].definition.id).toBe('def-cc');
    expect(out[0].values.map((v) => v.id)).toContain('val-1');
  });

  it('forbids without canReadDimension', async () => {
    const { service } = build({ canRead: false });
    await expect(service.listCatalog(scope, { unitId: 'unit-1', includeArchived: false }))
      .rejects.toBeInstanceOf(ForbiddenError);
  });
});
