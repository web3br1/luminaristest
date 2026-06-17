/**
 * PresetSyncService.test.ts — Part B P0 Slice 1, Component A (schema-evolution).
 *
 * Verifies the ADDITIVE-ONLY preset sync mechanism:
 *  - additive delta is correct (new field + new select option), nothing removed/renamed;
 *  - idempotent (a second run with no preset change is a no-op — no schema update call);
 *  - NEW relation markers (@@PRESET_TABLE_KEY::x) are resolved to the user's REAL table id
 *    in the applied schema (never a marker);
 *  - propagates the engine's ValidationError when the merge would invalidate existing data
 *    (updateTableSchemaAsSystem mocked to throw);
 *  - cross-tenant: NotFoundError when the table is not installed for the user.
 *
 * Mirrors the dynamicTables test style: buildService(overrides?) factory + jest.Mocked deps.
 */

import { PresetSyncService } from '../services/PresetSyncService';
import type { DynamicTableService } from '../services/DynamicTableService';
import type { IDynamicTableRepository } from '../repositories/IDynamicTableRepository';
import type { UserContext } from '../../../lib/authUtils';
import type { IDynamicTable, ISchemaField, ITableSchema } from '../models/DynamicTable.model';
import { NotFoundError, ValidationError } from '../../../lib/errors';
import { Role } from '../../users/models/User.model';
import { leadsModule } from '../presets/modules/core/LeadsModule';

// ── Fixtures ────────────────────────────────────────────────────────────────

const ADMIN_USER: UserContext = {
  id: 'user-1',
  userId: 'user-1',
  name: 'Admin',
  username: 'admin',
  email: 'admin@example.com',
  role: Role.ADMIN,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
  userRole: Role.ADMIN,
  userEmail: 'admin@example.com',
};

/**
 * A minimal "installed leads" schema that is intentionally BEHIND the current preset:
 *  - missing the relation fields `accountId`/`contactId` (preset adds them — but the
 *    LIVE preset module here is `leadsModule`; the test below installs a custom preset
 *    schema where applicable). For determinism we drive the preset via a stubbed service
 *    method, so here we model "installed" relative to whatever preset we pass.
 */
function buildInstalledLeadsSchema(): ITableSchema {
  // Clone the real preset and strip a field + an option to simulate an older install.
  const cloned: ITableSchema = JSON.parse(JSON.stringify(leadsModule.schema));
  // Remove the `source` field to simulate a NEW non-relation field in the preset.
  cloned.fields = cloned.fields.filter((f) => f.name !== 'source');
  // Narrow the status options to simulate a NEW option in the preset.
  const status = cloned.fields.find((f) => f.name === 'status');
  if (status && Array.isArray(status.options)) {
    status.options = status.options.filter((o) => o !== 'Disqualified');
  }
  return cloned;
}

function buildInstalledTable(schema: ITableSchema): IDynamicTable {
  return {
    id: 'tbl-leads-1',
    userId: 'user-1',
    name: 'Leads',
    internalName: 'leads',
    category: 'leads',
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    schema,
  } as unknown as IDynamicTable;
}

function buildMockRepository(): jest.Mocked<IDynamicTableRepository> {
  return {
    createTable: jest.fn(),
    findTableById: jest.fn(),
    findTableByName: jest.fn(async () => null),
    findTableByInternalName: jest.fn(async () => null),
    findTablesByUserId: jest.fn(async () => []),
    updateTable: jest.fn(),
    updateTableSchema: jest.fn(),
    deleteTable: jest.fn(),
    deleteTablesByUserId: jest.fn(),
    createData: jest.fn(),
    findDataById: jest.fn(async () => null),
    findDataByIds: jest.fn(async () => []),
    findDataByTableId: jest.fn(async () => ({ data: [], total: 0 })),
    findAllDataByTableId: jest.fn(async () => []),
    findDataBatchStreamByTableId: jest.fn(),
    updateData: jest.fn(),
    deleteData: jest.fn(),
    deleteAllDataByUserId: jest.fn(),
    countByFieldValue: jest.fn(async () => 0),
    countOverlaps: jest.fn(async () => 0),
    findRowsByFieldValue: jest.fn(async () => []),
    existsByIdInTable: jest.fn(async () => true),
    findTableByDataId: jest.fn(async () => null),
    countTablesByCategory: jest.fn(async () => []),
    findTablesReferencingTableId: jest.fn(async () => []),
    findRowsReferencingId: jest.fn(async () => []),
  } as unknown as jest.Mocked<IDynamicTableRepository>;
}

interface BuildOverrides {
  repository?: jest.Mocked<IDynamicTableRepository>;
  updateTableSchemaAsSystem?: jest.Mock;
}

function buildService(overrides: BuildOverrides = {}) {
  const repository = overrides.repository ?? buildMockRepository();
  const updateTableSchemaAsSystem =
    overrides.updateTableSchemaAsSystem ?? jest.fn(async () => ({}) as IDynamicTable);
  const dynamicTableService = {
    updateTableSchemaAsSystem,
  } as unknown as DynamicTableService;
  const service = new PresetSyncService(dynamicTableService, repository);
  return { service, repository, updateTableSchemaAsSystem };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('PresetSyncService.syncInstalledTableFromPreset', () => {
  beforeEach(() => jest.clearAllMocks());

  test('computes the additive delta: new field + new select option (nothing removed)', async () => {
    const installedSchema = buildInstalledLeadsSchema();
    const installedTable = buildInstalledTable(installedSchema);
    const repository = buildMockRepository();
    repository.findTableByInternalName.mockImplementation(async (_userId, internalName) =>
      internalName === 'leads' ? installedTable : null,
    );
    // assigneeId relation already exists in the installed schema → not a NEW field,
    // so no marker resolution is needed for this case.
    const { service, updateTableSchemaAsSystem } = buildService({ repository });

    const result = await service.syncInstalledTableFromPreset(ADMIN_USER, 'leads');

    // `source` is the only NEW non-relation field we stripped.
    expect(result.added).toContain('source');
    // `Disqualified` is the only option we stripped from `status`.
    expect(result.optionsAdded.status).toEqual(['Disqualified']);

    // The schema was applied once.
    expect(updateTableSchemaAsSystem).toHaveBeenCalledTimes(1);
    const [, appliedDto] = updateTableSchemaAsSystem.mock.calls[0];
    const appliedSchema = appliedDto.schema as ITableSchema;

    // Additive-only: every previously-installed field still present.
    for (const f of installedSchema.fields) {
      expect(appliedSchema.fields.some((af: ISchemaField) => af.name === f.name)).toBe(true);
    }
    // New field appended.
    expect(appliedSchema.fields.some((af: ISchemaField) => af.name === 'source')).toBe(true);
    // Status options widened (union), original options preserved.
    const appliedStatus = appliedSchema.fields.find((af: ISchemaField) => af.name === 'status');
    expect(appliedStatus?.options).toEqual(
      expect.arrayContaining(['Open', 'Won', 'Lost', 'Disqualified']),
    );
  });

  test('is idempotent: a second run with no preset change is a no-op', async () => {
    // Installed schema == full preset → no delta.
    const fullSchema: ITableSchema = JSON.parse(JSON.stringify(leadsModule.schema));
    const installedTable = buildInstalledTable(fullSchema);
    const repository = buildMockRepository();
    repository.findTableByInternalName.mockResolvedValue(installedTable);
    const { service, updateTableSchemaAsSystem } = buildService({ repository });

    const result = await service.syncInstalledTableFromPreset(ADMIN_USER, 'leads');

    expect(result).toEqual({ added: [], optionsAdded: {} });
    expect(updateTableSchemaAsSystem).not.toHaveBeenCalled();
  });

  test('resolves NEW relation marker to the user REAL table id (not a marker)', async () => {
    // Installed schema lacks the `assigneeId` relation → it becomes a NEW field whose
    // preset marker (@@PRESET_TABLE_KEY::employees) must resolve to the real table id.
    const installedSchema = buildInstalledLeadsSchema();
    installedSchema.fields = installedSchema.fields.filter((f) => f.name !== 'assigneeId');
    const installedTable = buildInstalledTable(installedSchema);

    const employeesTable = { id: 'tbl-employees-99', userId: 'user-1' } as unknown as IDynamicTable;
    const repository = buildMockRepository();
    repository.findTableByInternalName.mockImplementation(async (_userId, internalName) => {
      if (internalName === 'leads') return installedTable;
      if (internalName === 'employees') return employeesTable;
      return null;
    });
    const { service, updateTableSchemaAsSystem } = buildService({ repository });

    const result = await service.syncInstalledTableFromPreset(ADMIN_USER, 'leads');

    expect(result.added).toContain('assigneeId');
    const [, appliedDto] = updateTableSchemaAsSystem.mock.calls[0];
    const appliedSchema = appliedDto.schema as ITableSchema;
    const assignee = appliedSchema.fields.find((f: ISchemaField) => f.name === 'assigneeId');
    expect(assignee?.relation?.targetTable).toBe('tbl-employees-99');
    // Critically: NO marker leaks into the applied schema.
    expect(assignee?.relation?.targetTable).not.toContain('@@PRESET_TABLE_KEY::');
  });

  test('NotFoundError when a NEW relation marker targets an uninstalled table', async () => {
    const installedSchema = buildInstalledLeadsSchema();
    installedSchema.fields = installedSchema.fields.filter((f) => f.name !== 'assigneeId');
    const installedTable = buildInstalledTable(installedSchema);
    const repository = buildMockRepository();
    repository.findTableByInternalName.mockImplementation(async (_userId, internalName) =>
      internalName === 'leads' ? installedTable : null,
    );
    const { service } = buildService({ repository });

    await expect(service.syncInstalledTableFromPreset(ADMIN_USER, 'leads')).rejects.toBeInstanceOf(
      NotFoundError,
    );
  });

  test('propagates the engine ValidationError when the merge would invalidate existing data', async () => {
    const installedSchema = buildInstalledLeadsSchema();
    const installedTable = buildInstalledTable(installedSchema);
    const repository = buildMockRepository();
    repository.findTableByInternalName.mockResolvedValue(installedTable);
    const updateTableSchemaAsSystem = jest.fn(async () => {
      throw new ValidationError('Schema update would invalidate existing data. Aborting update.');
    });
    const { service } = buildService({ repository, updateTableSchemaAsSystem });

    await expect(
      service.syncInstalledTableFromPreset(ADMIN_USER, 'leads'),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(updateTableSchemaAsSystem).toHaveBeenCalledTimes(1);
  });

  test('cross-tenant: NotFoundError when the table is not installed for the user', async () => {
    const repository = buildMockRepository();
    repository.findTableByInternalName.mockResolvedValue(null);
    const { service, updateTableSchemaAsSystem } = buildService({ repository });

    await expect(
      service.syncInstalledTableFromPreset(ADMIN_USER, 'leads'),
    ).rejects.toBeInstanceOf(NotFoundError);
    expect(updateTableSchemaAsSystem).not.toHaveBeenCalled();
  });
});
