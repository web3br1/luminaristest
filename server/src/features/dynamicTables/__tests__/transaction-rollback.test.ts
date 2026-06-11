/**
 * transaction-rollback.test.ts  (R1 — integrity regression tests)
 *
 * Verifies that the prisma.$transaction wrapper introduced in DynamicTableService
 * rolls back the main record write when a rule plugin throws during afterCreate or
 * afterUpdate.
 *
 * Strategy: mock the prisma module and DynamicTableService's internal dependencies
 * so we can simulate a plugin failure after the record was "created" but before the
 * transaction commits. Because the actual SQLite database is not available in the
 * test environment, we construct a minimal fake $transaction that:
 *   1. Runs the callback with a fake tx client.
 *   2. If the callback throws, simulates rollback by discarding any writes made to
 *      the fake in-memory store.
 *   3. If the callback succeeds, commits (retains writes in the store).
 *
 * This validates the architectural contract: the service correctly places createData
 * AND afterCreate plugin execution inside the same transaction boundary.
 */

import { DynamicTableService } from '../services/DynamicTableService';
import type { IDynamicTableRepository } from '../repositories/IDynamicTableRepository';
import type { IDynamicTablePolicy } from '../policies/IDynamicTablePolicy';
import type { UserContext } from '../../../lib/authUtils';
import type { IDynamicTable, IDynamicTableData } from '../models/DynamicTable.model';
import type { RulePlugin, RuleContext } from '../rules/RuleTypes';
import { globalRuleRegistry } from '../rules/RuleRegistry';

// ── Prisma mock ───────────────────────────────────────────────────────────────

/**
 * Minimal fake implementation of prisma.$transaction.
 * Simulates rollback: if the callback throws, any writes performed via the tx
 * client (tracked in `txWrites`) are discarded; the throw propagates to caller.
 */
let txWrites: Array<{ op: string; args: any }> = [];
let persistedWrites: Array<{ op: string; args: any }> = [];

const fakeTxClient = {
  dynamicTableData: {
    create: jest.fn(async (args: any) => {
      const record = { id: 'new-record-id', dynamicTableId: args.data.dynamicTableId, data: args.data.data, createdAt: new Date(), updatedAt: new Date(), deletedAt: null };
      txWrites.push({ op: 'create', args: record });
      return record;
    }),
    update: jest.fn(async (args: any) => {
      const record = { id: args.where.id, data: args.data.data, dynamicTableId: 'table-1', createdAt: new Date(), updatedAt: new Date(), deletedAt: null };
      txWrites.push({ op: 'update', args: record });
      return record;
    }),
    findFirst: jest.fn(async () => null),
    findMany: jest.fn(async () => []),
    count: jest.fn(async () => 0),
  },
  dynamicTable: {
    findUnique: jest.fn(async () => null),
    findFirst: jest.fn(async () => null),
    findMany: jest.fn(async () => []),
  },
  $queryRaw: jest.fn(async () => [{ count: BigInt(0) }]),
};

jest.mock('../../../lib/prisma', () => ({
  __esModule: true,
  default: {
    $transaction: jest.fn(async (fn: (tx: any) => Promise<any>) => {
      // Reset in-flight writes for this transaction attempt
      txWrites = [];
      try {
        const result = await fn(fakeTxClient);
        // Commit: move tx writes to persisted store
        persistedWrites.push(...txWrites);
        txWrites = [];
        return result;
      } catch (err) {
        // Rollback: discard tx writes
        txWrites = [];
        throw err;
      }
    }),
  },
}));

jest.mock('../repositories/TransactionalDynamicTableRepository', () => {
  return {
    TransactionalDynamicTableRepository: jest.fn().mockImplementation(() => ({
      createData: fakeTxClient.dynamicTableData.create,
      updateData: fakeTxClient.dynamicTableData.update,
      findDataById: fakeTxClient.dynamicTableData.findFirst,
      findDataByTableId: jest.fn(async () => ({ data: [], total: 0 })),
      findDataByIds: fakeTxClient.dynamicTableData.findMany,
      findRowsByFieldValue: jest.fn(async () => []),
      existsByIdInTable: jest.fn(async () => true),
      countByFieldValue: jest.fn(async () => 0),
      countOverlaps: jest.fn(async () => 0),
      findTablesByUserId: jest.fn(async () => []),
      findTableById: fakeTxClient.dynamicTable.findUnique,
      findTablesReferencingTableId: jest.fn(async () => []),
      findRowsReferencingId: jest.fn(async () => []),
      findTableByDataId: jest.fn(async () => null),
      deleteData: jest.fn(async () => {}),
    })),
  };
});

// ── Minimal fakes ─────────────────────────────────────────────────────────────

const FAKE_TABLE: IDynamicTable = {
  id: 'table-1',
  userId: 'user-1',
  name: 'Test Table',
  internalName: 'testTable',
  category: 'other',
  createdAt: new Date(),
  updatedAt: new Date(),
  schema: {
    fields: [
      { name: 'title', type: 'string', label: 'Title', required: true },
    ],
  } as any,
};

const FAKE_USER: UserContext = {
  id: 'user-1',
  userId: 'user-1',
  email: 'test@example.com',
  role: 'user',
} as any;

function buildMockRepository(): jest.Mocked<IDynamicTableRepository> {
  return {
    createTable: jest.fn(),
    findTableById: jest.fn(async () => FAKE_TABLE),
    findTableByName: jest.fn(async () => null),
    findTableByInternalName: jest.fn(async () => null),
    findTablesByUserId: jest.fn(async () => [FAKE_TABLE]),
    updateTable: jest.fn(),
    updateTableSchema: jest.fn(),
    deleteTable: jest.fn(),
    deleteTablesByUserId: jest.fn(),
    createData: jest.fn(async () => ({ id: 'original-record', dynamicTableId: 'table-1', data: { title: 'hello' }, createdAt: new Date(), updatedAt: new Date(), deletedAt: null })),
    findDataById: jest.fn(async () => null),
    findDataByIds: jest.fn(async () => []),
    findDataByTableId: jest.fn(async () => ({ data: [], total: 0 })),
    findDataBatchStreamByTableId: jest.fn(),
    updateData: jest.fn(),
    deleteData: jest.fn(),
    deleteAllDataByUserId: jest.fn(),
    countTablesByCategory: jest.fn(async () => []),
    findTableByDataId: jest.fn(async () => FAKE_TABLE),
    countByFieldValue: jest.fn(async () => 0),
    countOverlaps: jest.fn(async () => 0),
    findRowsByFieldValue: jest.fn(async () => []),
    existsByIdInTable: jest.fn(async () => true),
    findTablesReferencingTableId: jest.fn(async () => []),
    findRowsReferencingId: jest.fn(async () => []),
  } as any;
}

function buildMockPolicy(allow = true): jest.Mocked<IDynamicTablePolicy> {
  return {
    canCreate: jest.fn(() => allow),
    canView: jest.fn(() => allow),
    canUpdate: jest.fn(() => allow),
    canDelete: jest.fn(() => allow),
    canManageData: jest.fn(() => allow),
  } as any;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('DynamicTableService — transaction rollback', () => {
  let savedPlugins: any[];

  beforeEach(() => {
    // Snapshot the global registry's plugin list and clear it so test plugins
    // don't bleed into other tests and production plugins don't interfere.
    savedPlugins = (globalRuleRegistry as any).plugins.slice();
    (globalRuleRegistry as any).plugins = [];
    persistedWrites = [];
    txWrites = [];
    jest.clearAllMocks();
  });

  afterEach(() => {
    // Restore the original plugin list.
    (globalRuleRegistry as any).plugins = savedPlugins;
  });

  // ── createTableData ────────────────────────────────────────────────────────

  test('createTableData: record IS committed when afterCreate plugin succeeds', async () => {
    const repo = buildMockRepository();
    const policy = buildMockPolicy();
    const service = new DynamicTableService(repo, policy);

    const successPlugin: RulePlugin = {
      name: 'SuccessPlugin',
      supports: () => true,
      afterCreate: jest.fn(async () => { /* no-op */ }),
    };
    globalRuleRegistry.register(successPlugin);

    const result = await service.createTableData(FAKE_USER, 'table-1', { data: { title: 'hello' } });

    // The TransactionalDynamicTableRepository.createData was called (via fake tx)
    expect(fakeTxClient.dynamicTableData.create).toHaveBeenCalledTimes(1);
    // afterCreate plugin was invoked
    expect(successPlugin.afterCreate).toHaveBeenCalledTimes(1);
    // The transaction committed: writes are in persistedWrites
    expect(persistedWrites).toHaveLength(1);
    expect(persistedWrites[0].op).toBe('create');
    expect(result).toBeDefined();
  });

  test('createTableData: record is ROLLED BACK when afterCreate plugin throws', async () => {
    const repo = buildMockRepository();
    const policy = buildMockPolicy();
    const service = new DynamicTableService(repo, policy);

    const failingPlugin: RulePlugin = {
      name: 'FailingAfterCreatePlugin',
      supports: () => true,
      afterCreate: jest.fn(async () => {
        throw new Error('Simulated plugin failure in afterCreate');
      }),
    };
    globalRuleRegistry.register(failingPlugin);

    await expect(
      service.createTableData(FAKE_USER, 'table-1', { data: { title: 'hello' } })
    ).rejects.toThrow('Simulated plugin failure in afterCreate');

    // createData was called inside the transaction...
    expect(fakeTxClient.dynamicTableData.create).toHaveBeenCalledTimes(1);
    // ...but the transaction rolled back: nothing in persistedWrites
    expect(persistedWrites).toHaveLength(0);
    // txWrites was also cleared (discarded on rollback)
    expect(txWrites).toHaveLength(0);
  });

  // ── updateTableData ────────────────────────────────────────────────────────

  test('updateTableData: record IS committed when afterUpdate plugin succeeds', async () => {
    const existingRecord: IDynamicTableData = {
      id: 'record-1',
      dynamicTableId: 'table-1',
      data: { title: 'old title' },
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    } as any;

    const repo = buildMockRepository();
    repo.findTableByDataId.mockResolvedValue(FAKE_TABLE);
    repo.findDataById.mockResolvedValue(existingRecord);

    const policy = buildMockPolicy();
    const service = new DynamicTableService(repo, policy);

    const successPlugin: RulePlugin = {
      name: 'SuccessUpdatePlugin',
      supports: () => true,
      afterUpdate: jest.fn(async () => { /* no-op */ }),
    };
    globalRuleRegistry.register(successPlugin);

    await service.updateTableData(FAKE_USER, 'record-1', { data: { title: 'new title' } });

    expect(fakeTxClient.dynamicTableData.update).toHaveBeenCalledTimes(1);
    expect(successPlugin.afterUpdate).toHaveBeenCalledTimes(1);
    expect(persistedWrites).toHaveLength(1);
    expect(persistedWrites[0].op).toBe('update');
  });

  test('updateTableData: record update is ROLLED BACK when afterUpdate plugin throws', async () => {
    const existingRecord: IDynamicTableData = {
      id: 'record-1',
      dynamicTableId: 'table-1',
      data: { title: 'old title' },
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    } as any;

    const repo = buildMockRepository();
    repo.findTableByDataId.mockResolvedValue(FAKE_TABLE);
    repo.findDataById.mockResolvedValue(existingRecord);

    const policy = buildMockPolicy();
    const service = new DynamicTableService(repo, policy);

    const failingPlugin: RulePlugin = {
      name: 'FailingAfterUpdatePlugin',
      supports: () => true,
      afterUpdate: jest.fn(async () => {
        throw new Error('Simulated plugin failure in afterUpdate');
      }),
    };
    globalRuleRegistry.register(failingPlugin);

    await expect(
      service.updateTableData(FAKE_USER, 'record-1', { data: { title: 'new title' } })
    ).rejects.toThrow('Simulated plugin failure in afterUpdate');

    // updateData was called inside the transaction...
    expect(fakeTxClient.dynamicTableData.update).toHaveBeenCalledTimes(1);
    // ...but rolled back
    expect(persistedWrites).toHaveLength(0);
    expect(txWrites).toHaveLength(0);
  });

  // ── isSystem bypass prevention (R2 regression) ────────────────────────────

  test('createTableData: __isSystem in client body is stripped and does not set isSystem=true', async () => {
    const repo = buildMockRepository();
    const policy = buildMockPolicy();
    const service = new DynamicTableService(repo, policy);

    // A plugin that inspects ctx.isSystem and records its value
    let capturedIsSystem: boolean | undefined;
    const inspectorPlugin: RulePlugin = {
      name: 'IsSystemInspectorPlugin',
      supports: () => true,
      afterCreate: jest.fn(async (ctx: RuleContext) => {
        capturedIsSystem = ctx.isSystem;
      }),
    };
    globalRuleRegistry.register(inspectorPlugin);

    // Client sends __isSystem: true — this must be ignored
    await service.createTableData(FAKE_USER, 'table-1', { data: { title: 'hello', __isSystem: true } as any });

    // isSystem in context must be false (derived from options parameter, not payload)
    expect(capturedIsSystem).toBe(false);
    // __isSystem must not appear in the stored data
    const storedData = fakeTxClient.dynamicTableData.create.mock.calls[0][0].data.data;
    expect(storedData.__isSystem).toBeUndefined();
  });

  test('createTableData: options.isSystem=true correctly sets isSystem in context', async () => {
    const repo = buildMockRepository();
    const policy = buildMockPolicy();
    const service = new DynamicTableService(repo, policy);

    let capturedIsSystem: boolean | undefined;
    const inspectorPlugin: RulePlugin = {
      name: 'IsSystemInspectorPlugin2',
      supports: () => true,
      afterCreate: jest.fn(async (ctx: RuleContext) => {
        capturedIsSystem = ctx.isSystem;
      }),
    };
    globalRuleRegistry.register(inspectorPlugin);

    await service.createTableData(FAKE_USER, 'table-1', { data: { title: 'hello' } }, { isSystem: true });

    expect(capturedIsSystem).toBe(true);
  });
});
