/**
 * transaction-aware-validation.test.ts
 *
 * Verifies that write VALIDATIONS are transaction-aware: when createTableData /
 * updateTableData are composed inside a single runInTransaction(options.tx), a
 * later write can validate a relation field against a row created by an EARLIER
 * write in the SAME transaction.
 *
 * This is the CRM lead-conversion scenario: create an account, then create a
 * contact whose `accountId` relation references the just-created account. The
 * relation-existence check (validateAdvancedRules → existsByIdInTable) must see
 * the in-tx account and pass — even though the committed-state repository does
 * NOT contain it.
 *
 * Strategy (mirrors transaction-rollback.test.ts): the committed-state base repo
 * reports the new rows as NON-existent (existsByIdInTable → false). The tx-bound
 * TransactionalDynamicTableRepository is backed by a shared in-memory store that
 * IS populated by createData within the transaction, so its existsByIdInTable
 * returns true for in-tx ids. The test passes only if validations run against the
 * tx-bound repo (the fix), and would fail if they ran against committed state.
 */

import { DynamicTableService } from '../services/DynamicTableService';
import type { IDynamicTableRepository } from '../repositories/IDynamicTableRepository';
import type { IDynamicTablePolicy } from '../policies/IDynamicTablePolicy';
import type { UserContext } from '../../../lib/authUtils';
import type { IDynamicTable, IDynamicTableData } from '../models/DynamicTable.model';
import { globalRuleRegistry } from '../rules/RuleRegistry';

// ── Shared in-memory store representing UNCOMMITTED (in-tx) rows ────────────────
// Maps `${tableId}:${rowId}` → row. Populated by the tx repo's createData; read
// back by the tx repo's existsByIdInTable. Cleared/committed by the fake $transaction.
type Row = { id: string; dynamicTableId: string; data: Record<string, unknown> };
let inTxRows: Map<string, Row> = new Map();
let committedRows: Map<string, Row> = new Map();
let idCounter = 0;
// cuid-format id (relation fields validate with z.string().cuid()).
const nextCuid = () => `c${'l'.repeat(8)}${String(idCounter++).padStart(16, '0')}`;

// ── Prisma mock: fake $transaction that commits/rolls back the in-tx store ─────
jest.mock('../../../lib/prisma', () => ({
  __esModule: true,
  default: {
    $transaction: jest.fn(async (fn: (tx: any) => Promise<any>) => {
      inTxRows = new Map();
      try {
        const result = await fn({ __fakeTx: true });
        // Commit: promote in-tx rows to committed.
        for (const [k, v] of inTxRows) committedRows.set(k, v);
        inTxRows = new Map();
        return result;
      } catch (err) {
        inTxRows = new Map(); // rollback: discard
        throw err;
      }
    }),
  },
}));

// ── Tx repo mock: writes/reads against the shared in-tx store ───────────────────
jest.mock('../repositories/TransactionalDynamicTableRepository', () => {
  return {
    TransactionalDynamicTableRepository: jest.fn().mockImplementation(() => ({
      createData: jest.fn(async (tableId: string, data: Record<string, unknown>) => {
        const id = nextCuid();
        const row: Row = { id, dynamicTableId: tableId, data };
        inTxRows.set(`${tableId}:${id}`, row);
        return { ...row, createdAt: new Date(), updatedAt: new Date(), deletedAt: null };
      }),
      updateData: jest.fn(async (dataId: string, data: Record<string, unknown>) => ({
        id: dataId, dynamicTableId: 'unknown', data, createdAt: new Date(), updatedAt: new Date(), deletedAt: null,
      })),
      // Tx-aware existence: visible if created in THIS tx OR already committed.
      existsByIdInTable: jest.fn(async (dataId: string, tableId: string) =>
        inTxRows.has(`${tableId}:${dataId}`) || committedRows.has(`${tableId}:${dataId}`)
      ),
      countByFieldValue: jest.fn(async () => 0),
      countOverlaps: jest.fn(async () => 0),
      findAllDataByTableId: jest.fn(async () => []),
      findTableById: jest.fn(async (tableId: string) =>
        TABLES.find(t => t.id === tableId) ?? null
      ),
      findDataById: jest.fn(async () => null),
      findDataByTableId: jest.fn(async () => ({ data: [], total: 0 })),
      findDataByIds: jest.fn(async () => []),
      findRowsByFieldValue: jest.fn(async () => []),
      findTablesByUserId: jest.fn(async () => TABLES),
      findTablesReferencingTableId: jest.fn(async () => []),
      findRowsReferencingId: jest.fn(async () => []),
      findTableByDataId: jest.fn(async () => null),
      deleteData: jest.fn(async () => {}),
    })),
  };
});

// ── Fixtures: two tables, contact has a relation field → account ────────────────
const ACCOUNT_TABLE: IDynamicTable = {
  id: 'tbl-account',
  userId: 'user-1',
  name: 'Accounts',
  internalName: 'accounts',
  category: 'other',
  createdAt: new Date(),
  updatedAt: new Date(),
  schema: {
    fields: [{ name: 'companyName', type: 'string', label: 'Company', required: true }],
  } as any,
};

const CONTACT_TABLE: IDynamicTable = {
  id: 'tbl-contact',
  userId: 'user-1',
  name: 'Contacts',
  internalName: 'contacts',
  category: 'other',
  createdAt: new Date(),
  updatedAt: new Date(),
  schema: {
    fields: [
      { name: 'fullName', type: 'string', label: 'Name', required: true },
      {
        name: 'accountId',
        type: 'relation',
        label: 'Account',
        required: true,
        relation: { targetTable: 'tbl-account' },
      },
    ],
  } as any,
};

const TABLES = [ACCOUNT_TABLE, CONTACT_TABLE];

const FAKE_USER: UserContext = {
  id: 'user-1', userId: 'user-1', email: 'test@example.com', role: 'user',
} as any;

// ── Committed-state base repository: new in-tx rows DON'T exist here ────────────
function buildBaseRepository(): jest.Mocked<IDynamicTableRepository> {
  return {
    createTable: jest.fn(),
    findTableById: jest.fn(async (id: string) => TABLES.find(t => t.id === id) ?? null),
    findTableByName: jest.fn(async () => null),
    findTableByInternalName: jest.fn(async () => null),
    findTablesByUserId: jest.fn(async () => TABLES),
    updateTable: jest.fn(),
    updateTableSchema: jest.fn(),
    deleteTable: jest.fn(),
    deleteTablesByUserId: jest.fn(),
    createData: jest.fn(),
    findDataById: jest.fn(async () => null),
    findDataByIds: jest.fn(async () => []),
    findDataByTableId: jest.fn(async () => ({ data: [], total: 0 })),
    findDataBatchStreamByTableId: jest.fn(),
    updateData: jest.fn(),
    deleteData: jest.fn(),
    deleteAllDataByUserId: jest.fn(),
    countTablesByCategory: jest.fn(async () => []),
    findTableByDataId: jest.fn(async () => null),
    countByFieldValue: jest.fn(async () => 0),
    countOverlaps: jest.fn(async () => 0),
    findRowsByFieldValue: jest.fn(async () => []),
    // Committed state: an in-tx row is NOT here → relation check would FAIL if used.
    existsByIdInTable: jest.fn(async () => false),
    findAllDataByTableId: jest.fn(async () => []),
    findTablesReferencingTableId: jest.fn(async () => []),
    findRowsReferencingId: jest.fn(async () => []),
  } as any;
}

function buildPolicy(): jest.Mocked<IDynamicTablePolicy> {
  return {
    canCreate: jest.fn(() => true),
    canView: jest.fn(() => true),
    canUpdate: jest.fn(() => true),
    canDelete: jest.fn(() => true),
    canManageData: jest.fn(() => true),
  } as any;
}

describe('DynamicTableService — transaction-aware validations', () => {
  let savedPlugins: any[];

  beforeEach(() => {
    savedPlugins = (globalRuleRegistry as any).plugins.slice();
    (globalRuleRegistry as any).plugins = [];
    inTxRows = new Map();
    committedRows = new Map();
    idCounter = 0;
    jest.clearAllMocks();
  });

  afterEach(() => {
    (globalRuleRegistry as any).plugins = savedPlugins;
  });

  test('composed in-tx writes: contact relation references an account created earlier in the SAME tx → SUCCEEDS', async () => {
    const repo = buildBaseRepository();
    const service = new DynamicTableService(repo, buildPolicy());

    let createdContact: IDynamicTableData | undefined;

    await service.runInTransaction(async (tx) => {
      const account = await service.createTableData(
        FAKE_USER, 'tbl-account', { data: { companyName: 'Acme Inc' } }, { tx }
      );
      // The relation check for accountId must see the just-created account IN THIS TX.
      createdContact = await service.createTableData(
        FAKE_USER, 'tbl-contact', { data: { fullName: 'Jane Doe', accountId: account.id } }, { tx }
      );
    });

    // Did not throw "Related record ... was not found".
    expect(createdContact).toBeDefined();
    expect((createdContact!.data as Record<string, unknown>).accountId).toBeDefined();
    // Committed state base repo was NEVER consulted for in-tx relation existence.
    expect(repo.existsByIdInTable).not.toHaveBeenCalled();
    // Both rows are committed after the tx succeeds.
    expect(committedRows.size).toBe(2);
  });

  test('composed in-tx writes ROLL BACK entirely when a later step throws', async () => {
    const repo = buildBaseRepository();
    const service = new DynamicTableService(repo, buildPolicy());

    await expect(
      service.runInTransaction(async (tx) => {
        await service.createTableData(
          FAKE_USER, 'tbl-account', { data: { companyName: 'Acme Inc' } }, { tx }
        );
        const account = await service.createTableData(
          FAKE_USER, 'tbl-account', { data: { companyName: 'Beta LLC' } }, { tx }
        );
        // Sanity: relation would resolve, but a later step aborts the whole tx.
        await service.createTableData(
          FAKE_USER, 'tbl-contact', { data: { fullName: 'X', accountId: account.id } }, { tx }
        );
        throw new Error('boom — later orchestration step failed');
      })
    ).rejects.toThrow('boom — later orchestration step failed');

    // Nothing committed: full rollback.
    expect(committedRows.size).toBe(0);
  });

  test('WITHOUT a tx, the relation check runs against committed state (default behavior preserved)', async () => {
    const repo = buildBaseRepository();
    const service = new DynamicTableService(repo, buildPolicy());

    // No tx → uses this.repository, whose existsByIdInTable returns false → fails.
    await expect(
      service.createTableData(
        FAKE_USER, 'tbl-contact', { data: { fullName: 'Jane Doe', accountId: nextCuid() } }
      )
    ).rejects.toThrow(/was not found/);

    expect(repo.existsByIdInTable).toHaveBeenCalled();
  });
});
