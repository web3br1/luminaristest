/**
 * batch-delete.test.ts
 *
 * Verifies DynamicTableService.deleteTableDataBatch:
 *   1. soft-deletes N rows that all belong to the target table + user (atomic, in tx).
 *   2. throws NotFoundError and rolls back the WHOLE batch when any id is
 *      cross-tenant / in another table / missing (no partial deletes).
 *
 * Strategy mirrors transaction-rollback.test.ts: the prisma.$transaction wrapper is
 * faked to commit on success and discard writes on throw; the TransactionalDynamic
 * TableRepository is mocked with an in-memory row→table index so findTableByDataId
 * resolves each row's parent table and deleteData records soft-deletes.
 */

import { DynamicTableService } from '../services/DynamicTableService';
import type { IDynamicTableRepository } from '../repositories/IDynamicTableRepository';
import type { IDynamicTablePolicy } from '../policies/IDynamicTablePolicy';
import type { UserContext } from '../../../lib/authUtils';
import type { IDynamicTable } from '../models/DynamicTable.model';
import { NotFoundError } from '../../../lib/errors';
import { Role } from '../../users/models/User.model';

// ── In-memory state shared between the prisma + tx-repo mocks ──────────────────
// rowIndex: dataId → { tableId, userId } describing where a row lives.
const rowIndex = new Map<string, { tableId: string; userId: string }>();
let committedDeletes: string[] = [];
let txDeletes: string[] = [];

jest.mock('../../../lib/prisma', () => ({
  __esModule: true,
  default: {
    $transaction: jest.fn(async (fn: (tx: any) => Promise<any>) => {
      txDeletes = [];
      try {
        const result = await fn({ __fakeTx: true });
        committedDeletes.push(...txDeletes); // commit
        txDeletes = [];
        return result;
      } catch (err) {
        txDeletes = []; // rollback
        throw err;
      }
    }),
  },
}));

jest.mock('../repositories/TransactionalDynamicTableRepository', () => ({
  TransactionalDynamicTableRepository: jest.fn().mockImplementation(() => ({
    findTableByDataId: jest.fn(async (dataId: string) => {
      const loc = rowIndex.get(dataId);
      if (!loc) return null;
      return {
        id: loc.tableId,
        userId: loc.userId,
        name: 'T',
        internalName: 'leads',
        category: 'other',
        createdAt: new Date(),
        updatedAt: new Date(),
        schema: { fields: [] },
      } as unknown as IDynamicTable;
    }),
    deleteData: jest.fn(async (dataId: string) => {
      txDeletes.push(dataId);
    }),
  })),
}));

// ── Fakes ──────────────────────────────────────────────────────────────────────
const referenceDate = new Date('2026-06-17T00:00:00.000Z');
const TABLE_ID = 'table_leads';
const USER_ID = 'user_owner';

const OWNER_TABLE: IDynamicTable = {
  id: TABLE_ID,
  userId: USER_ID,
  name: 'Leads',
  internalName: 'leads',
  category: 'other',
  createdAt: referenceDate,
  updatedAt: referenceDate,
  schema: { fields: [] } as unknown as IDynamicTable['schema'],
};

const user: UserContext = {
  id: USER_ID, userId: USER_ID, name: 'Owner', username: 'owner', email: 'o@x.com',
  role: Role.USER, createdAt: referenceDate, updatedAt: referenceDate,
  userRole: Role.USER, userEmail: 'o@x.com', userName: 'Owner',
};

function buildService() {
  const repo = {
    findTableById: jest.fn(async () => OWNER_TABLE),
  } as unknown as jest.Mocked<IDynamicTableRepository>;
  const policy: jest.Mocked<IDynamicTablePolicy> = {
    canView: jest.fn(() => true),
    canManageData: jest.fn(() => true),
  } as unknown as jest.Mocked<IDynamicTablePolicy>;
  const service = new DynamicTableService(repo, policy);
  // getTableById calls repository.findTableById then policy.canView.
  jest.spyOn(service, 'getTableById').mockResolvedValue(OWNER_TABLE);
  return { service, repo, policy };
}

beforeEach(() => {
  jest.clearAllMocks();
  rowIndex.clear();
  committedDeletes = [];
  txDeletes = [];
});

describe('DynamicTableService.deleteTableDataBatch', () => {
  it('soft-deletes all N rows that belong to the table + user', async () => {
    rowIndex.set('row_1', { tableId: TABLE_ID, userId: USER_ID });
    rowIndex.set('row_2', { tableId: TABLE_ID, userId: USER_ID });
    rowIndex.set('row_3', { tableId: TABLE_ID, userId: USER_ID });
    const { service } = buildService();

    const result = await service.deleteTableDataBatch(user, TABLE_ID, ['row_1', 'row_2', 'row_3']);

    expect(result).toEqual({ deleted: 3 });
    expect(committedDeletes.sort()).toEqual(['row_1', 'row_2', 'row_3']);
  });

  it('dedupes repeated ids', async () => {
    rowIndex.set('row_1', { tableId: TABLE_ID, userId: USER_ID });
    const { service } = buildService();

    const result = await service.deleteTableDataBatch(user, TABLE_ID, ['row_1', 'row_1']);

    expect(result).toEqual({ deleted: 1 });
    expect(committedDeletes).toEqual(['row_1']);
  });

  it('throws NotFoundError and rolls back when an id belongs to another tenant', async () => {
    rowIndex.set('row_1', { tableId: TABLE_ID, userId: USER_ID });
    rowIndex.set('row_evil', { tableId: TABLE_ID, userId: 'user_attacker' }); // same table id, other owner
    const { service } = buildService();

    await expect(
      service.deleteTableDataBatch(user, TABLE_ID, ['row_1', 'row_evil'])
    ).rejects.toBeInstanceOf(NotFoundError);

    // Atomic: nothing committed.
    expect(committedDeletes).toEqual([]);
  });

  it('throws NotFoundError and rolls back when an id is in a different table', async () => {
    rowIndex.set('row_1', { tableId: TABLE_ID, userId: USER_ID });
    rowIndex.set('row_other', { tableId: 'table_other', userId: USER_ID });
    const { service } = buildService();

    await expect(
      service.deleteTableDataBatch(user, TABLE_ID, ['row_1', 'row_other'])
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(committedDeletes).toEqual([]);
  });

  it('throws NotFoundError and rolls back when an id does not exist', async () => {
    rowIndex.set('row_1', { tableId: TABLE_ID, userId: USER_ID });
    const { service } = buildService();

    await expect(
      service.deleteTableDataBatch(user, TABLE_ID, ['row_1', 'row_missing'])
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(committedDeletes).toEqual([]);
  });
});
