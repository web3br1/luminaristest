/**
 * Characterization (integration) tests for the dynamicTables core.
 *
 * These run against a real, isolated SQLite database (test-integration.db, created fresh in
 * beforeAll via `prisma db push`). They exercise the REAL prisma.$transaction, the governance
 * engine and the rule plugins — the parts a fake repository cannot cover, since the write paths
 * open their own transaction and instantiate a tx-bound repository internally.
 *
 * Goal: lock the CURRENT behavior of the core before the Phase C decomposition refactor.
 *
 * NOTE: kept as a SINGLE file on purpose — all cases share one SQLite file, so running them in
 * one worker avoids cross-file DB races. Split into per-worker DBs only if this grows too large.
 */
import { execSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import prisma from '@/lib/prisma';
import { DynamicTableRepository } from '@/features/dynamicTables/repositories/DynamicTableRepository';
import { DynamicTablePolicy } from '@/features/dynamicTables/policies/DynamicTablePolicy';
import { DynamicTableService } from '@/features/dynamicTables/services/DynamicTableService';
import { globalRuleRegistry } from '@/features/dynamicTables/rules/RuleRegistry';
import type { RulePlugin } from '@/features/dynamicTables/rules/RuleTypes';
import { Role } from '@/features/users/models/User.model';
import { ForbiddenError, ValidationError } from '@/lib/errors';
import type { UserContext } from '@/lib/authUtils';

const SERVER_DIR = path.resolve(__dirname, '../../../../..');

const service = new DynamicTableService(new DynamicTableRepository(), new DynamicTablePolicy());

// A test plugin that mutates ctx.after on beforeUpdate, to prove mutated derived fields persist.
const mutationPlugin: RulePlugin = {
  name: 'TestMutationPlugin',
  supports: (ctx) => ctx.table.internalName === 'test_mutation_table',
  beforeUpdate: (ctx) => {
    if (ctx.after) (ctx.after as any).derived = 'COMPUTED_BY_PLUGIN';
  },
};
globalRuleRegistry.register(mutationPlugin);

function ctxFor(userId: string, role: Role = Role.USER): UserContext {
  return { id: userId, userId, name: 'u', username: userId, email: `${userId}@test.co`, userEmail: `${userId}@test.co`, role, userRole: role, createdAt: new Date(), updatedAt: new Date() };
}

async function seedUser(id: string, role: Role = Role.USER) {
  return prisma.user.create({ data: { id, username: id, email: `${id}@test.co`, password: 'x', role } });
}

async function seedTable(userId: string, internalName: string, schema: any, name = 'Test Table') {
  return service.createTableAsSystem(userId, { name, category: 'people', internalName, schema } as any);
}

const create = (user: UserContext, tableId: string, data: any) =>
  service.createTableData(user, tableId, { data } as any);
const update = (user: UserContext, dataId: string, data: any) =>
  service.updateTableData(user, dataId, { data } as any);

beforeAll(() => {
  const dbFile = path.join(SERVER_DIR, 'prisma', 'test-integration.db');
  for (const f of [dbFile, `${dbFile}-journal`]) if (fs.existsSync(f)) fs.rmSync(f);
  execSync('npx prisma db push --skip-generate --accept-data-loss', {
    cwd: SERVER_DIR,
    env: { ...process.env, DATABASE_URL: 'file:./test-integration.db' },
    stdio: 'inherit',
  });
}, 120000);

afterEach(async () => {
  await prisma.dynamicTableData.deleteMany();
  await prisma.dynamicTable.deleteMany();
  await prisma.user.deleteMany();
});

afterAll(async () => {
  await prisma.$disconnect();
});

// --- Shared schemas ------------------------------------------------------------------------

const BASIC_SCHEMA = {
  fields: [
    { name: 'title', label: 'Title', type: 'string', required: true },
    { name: 'status', label: 'Status', type: 'select', required: true, options: ['Open', 'Closed'] },
  ],
  immutableAfter: [{ condition: { field: 'status', op: 'eq', value: 'Closed' }, scope: 'all' }],
};

describe('Tier-0 (multi-tenant isolation)', () => {
  it('allows the owner to read their own table', async () => {
    await seedUser('userA');
    const t = await seedTable('userA', 'basic_tbl', BASIC_SCHEMA);
    await expect(service.getTableById(ctxFor('userA'), t.id)).resolves.toMatchObject({ id: t.id });
  });

  it('denies a different tenant from reading the table', async () => {
    await seedUser('userA'); await seedUser('userB');
    const t = await seedTable('userA', 'basic_tbl', BASIC_SCHEMA);
    await expect(service.getTableById(ctxFor('userB'), t.id)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('denies a different tenant from updating a row', async () => {
    await seedUser('userA'); await seedUser('userB');
    const t = await seedTable('userA', 'basic_tbl', BASIC_SCHEMA);
    const row = await create(ctxFor('userA'), t.id, { title: 'Hi', status: 'Open' });
    await expect(update(ctxFor('userB'), row.id, { title: 'Hacked' })).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('Schema validation engine', () => {
  it('creates a row that satisfies the schema', async () => {
    await seedUser('userA');
    const t = await seedTable('userA', 'basic_tbl', BASIC_SCHEMA);
    const created = await create(ctxFor('userA'), t.id, { title: 'Hello', status: 'Open' });
    expect((created.data as any).title).toBe('Hello');
  });

  it('rejects a row missing a required field', async () => {
    await seedUser('userA');
    const t = await seedTable('userA', 'basic_tbl', BASIC_SCHEMA);
    await expect(create(ctxFor('userA'), t.id, { status: 'Open' })).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects a select value outside the declared options', async () => {
    await seedUser('userA');
    const t = await seedTable('userA', 'basic_tbl', BASIC_SCHEMA);
    await expect(create(ctxFor('userA'), t.id, { title: 'X', status: 'Nope' })).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('Governance: immutableAfter', () => {
  it('blocks any change once the record is immutable (status = Closed)', async () => {
    await seedUser('userA');
    const t = await seedTable('userA', 'basic_tbl', BASIC_SCHEMA);
    const row = await create(ctxFor('userA'), t.id, { title: 'Hi', status: 'Closed' });
    await expect(update(ctxFor('userA'), row.id, { title: 'Changed' })).rejects.toBeInstanceOf(ValidationError);
  });

  it('allows updates while still mutable (status = Open)', async () => {
    await seedUser('userA');
    const t = await seedTable('userA', 'basic_tbl', BASIC_SCHEMA);
    const row = await create(ctxFor('userA'), t.id, { title: 'Hi', status: 'Open' });
    const updated = await update(ctxFor('userA'), row.id, { title: 'Changed' });
    expect((updated.data as any).title).toBe('Changed');
  });
});

describe('Governance: unique', () => {
  const SCHEMA = { fields: [{ name: 'code', label: 'Code', type: 'string', required: true, unique: true }] };
  it('rejects a duplicate value on a unique field', async () => {
    await seedUser('userA');
    const t = await seedTable('userA', 'uniq_tbl', SCHEMA);
    await create(ctxFor('userA'), t.id, { code: 'ABC' });
    await expect(create(ctxFor('userA'), t.id, { code: 'ABC' })).rejects.toBeInstanceOf(ValidationError);
  });
  it('allows distinct values', async () => {
    await seedUser('userA');
    const t = await seedTable('userA', 'uniq_tbl', SCHEMA);
    await create(ctxFor('userA'), t.id, { code: 'ABC' });
    await expect(create(ctxFor('userA'), t.id, { code: 'XYZ' })).resolves.toBeTruthy();
  });
});

describe('Governance: compositeUnique', () => {
  const SCHEMA = {
    fields: [
      { name: 'a', label: 'A', type: 'string', required: true },
      { name: 'b', label: 'B', type: 'string', required: true },
    ],
    compositeUnique: [{ fields: ['a', 'b'] }],
  };
  it('rejects a duplicate (a,b) combination', async () => {
    await seedUser('userA');
    const t = await seedTable('userA', 'comp_tbl', SCHEMA);
    await create(ctxFor('userA'), t.id, { a: '1', b: '2' });
    await expect(create(ctxFor('userA'), t.id, { a: '1', b: '2' })).rejects.toBeInstanceOf(ValidationError);
  });
  it('allows a partially-different combination', async () => {
    await seedUser('userA');
    const t = await seedTable('userA', 'comp_tbl', SCHEMA);
    await create(ctxFor('userA'), t.id, { a: '1', b: '2' });
    await expect(create(ctxFor('userA'), t.id, { a: '1', b: '3' })).resolves.toBeTruthy();
  });
});

describe('Governance: requiredIf', () => {
  const SCHEMA = {
    fields: [
      { name: 'status', label: 'Status', type: 'select', required: true, options: ['Open', 'Cancelled'] },
      { name: 'reason', label: 'Reason', type: 'string', required: false, requiredIf: { field: 'status', op: 'eq', value: 'Cancelled' } },
    ],
  };
  it('requires the conditional field when the condition is met', async () => {
    await seedUser('userA');
    const t = await seedTable('userA', 'reqif_tbl', SCHEMA);
    await expect(create(ctxFor('userA'), t.id, { status: 'Cancelled' })).rejects.toBeInstanceOf(ValidationError);
  });
  it('does not require it when the condition is not met', async () => {
    await seedUser('userA');
    const t = await seedTable('userA', 'reqif_tbl', SCHEMA);
    await expect(create(ctxFor('userA'), t.id, { status: 'Open' })).resolves.toBeTruthy();
  });
});

describe('Governance: compare (cross-field)', () => {
  const SCHEMA = {
    fields: [
      { name: 'min', label: 'Min', type: 'number', required: true },
      { name: 'max', label: 'Max', type: 'number', required: true },
    ],
    compare: [{ left: 'max', op: 'gt', right: 'min' }],
  };
  it('rejects when max is not greater than min', async () => {
    await seedUser('userA');
    const t = await seedTable('userA', 'cmp_tbl', SCHEMA);
    await expect(create(ctxFor('userA'), t.id, { min: 10, max: 5 })).rejects.toBeInstanceOf(ValidationError);
  });
  it('accepts when max > min', async () => {
    await seedUser('userA');
    const t = await seedTable('userA', 'cmp_tbl', SCHEMA);
    await expect(create(ctxFor('userA'), t.id, { min: 5, max: 10 })).resolves.toBeTruthy();
  });
});

describe('Governance: lifecycle (state machine)', () => {
  const SCHEMA = {
    fields: [{ name: 'status', label: 'Status', type: 'select', required: true, options: ['Open', 'Closed', 'Archived'] }],
    lifecycle: [{ field: 'status', transitions: { Open: ['Closed'] } }],
  };
  it('allows a declared transition (Open → Closed)', async () => {
    await seedUser('userA');
    const t = await seedTable('userA', 'life_tbl', SCHEMA);
    const row = await create(ctxFor('userA'), t.id, { status: 'Open' });
    const updated = await update(ctxFor('userA'), row.id, { status: 'Closed' });
    expect((updated.data as any).status).toBe('Closed');
  });
  it('rejects an undeclared transition (Open → Archived)', async () => {
    await seedUser('userA');
    const t = await seedTable('userA', 'life_tbl', SCHEMA);
    const row = await create(ctxFor('userA'), t.id, { status: 'Open' });
    await expect(update(ctxFor('userA'), row.id, { status: 'Archived' })).rejects.toBeInstanceOf(ValidationError);
  });
  it('treats a state absent from the map as terminal (Closed → anything fails)', async () => {
    await seedUser('userA');
    const t = await seedTable('userA', 'life_tbl', SCHEMA);
    const row = await create(ctxFor('userA'), t.id, { status: 'Open' });
    await update(ctxFor('userA'), row.id, { status: 'Closed' });
    await expect(update(ctxFor('userA'), row.id, { status: 'Open' })).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('Governance: readOnly + isSystem bypass', () => {
  const SCHEMA = {
    fields: [
      { name: 'code', label: 'Code', type: 'string', required: true, readOnly: true },
      { name: 'note', label: 'Note', type: 'string', required: false },
    ],
  };
  it('rejects a direct change to a readOnly field', async () => {
    await seedUser('userA');
    const t = await seedTable('userA', 'ro_tbl', SCHEMA);
    const row = await create(ctxFor('userA'), t.id, { code: 'A', note: 'x' });
    await expect(update(ctxFor('userA'), row.id, { code: 'B' })).rejects.toBeInstanceOf(ValidationError);
  });
  it('allows changing a non-readOnly field', async () => {
    await seedUser('userA');
    const t = await seedTable('userA', 'ro_tbl', SCHEMA);
    const row = await create(ctxFor('userA'), t.id, { code: 'A', note: 'x' });
    const updated = await update(ctxFor('userA'), row.id, { note: 'y' });
    expect((updated.data as any).note).toBe('y');
  });
  it('a client-supplied __isSystem does NOT bypass readOnly (R2: isSystem derives from call context)', async () => {
    // Security divergence from the fork kept ON PURPOSE (main fix R2): __isSystem arriving in a
    // client payload is stripped/ignored — system privilege comes from the *AsSystem call path,
    // never from request data. A client claiming __isSystem must still be rejected.
    await seedUser('userA');
    const t = await seedTable('userA', 'ro_tbl', SCHEMA);
    const row = await create(ctxFor('userA'), t.id, { code: 'A', note: 'x' });
    await expect(update(ctxFor('userA'), row.id, { __isSystem: true, code: 'B' })).rejects.toBeInstanceOf(ValidationError);
  });
  it('does NOT bypass for a regular user in production', async () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      await seedUser('userA');
      const t = await seedTable('userA', 'ro_tbl', SCHEMA);
      const row = await create(ctxFor('userA'), t.id, { code: 'A', note: 'x' });
      await expect(update(ctxFor('userA'), row.id, { __isSystem: true, code: 'B' })).rejects.toBeInstanceOf(ValidationError);
    } finally {
      process.env.NODE_ENV = prev;
    }
  });
  it('an ADMIN sending __isSystem in the payload is ALSO rejected (R2)', async () => {
    const prev = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      await seedUser('admin', Role.ADMIN);
      const t = await seedTable('admin', 'ro_tbl', SCHEMA);
      const row = await create(ctxFor('admin', Role.ADMIN), t.id, { code: 'A', note: 'x' });
      await expect(update(ctxFor('admin', Role.ADMIN), row.id, { __isSystem: true, code: 'B' })).rejects.toBeInstanceOf(ValidationError);
    } finally {
      process.env.NODE_ENV = prev;
    }
  });
});

describe('Rules engine: beforeUpdate mutation persistence', () => {
  const SCHEMA = {
    fields: [
      { name: 'title', label: 'Title', type: 'string', required: true },
      { name: 'status', label: 'Status', type: 'select', required: true, options: ['Open', 'Closed'] },
      { name: 'derived', label: 'Derived', type: 'string', required: false },
    ],
  };
  it('persists fields a plugin writes into ctx.after during beforeUpdate', async () => {
    await seedUser('userA');
    const t = await seedTable('userA', 'test_mutation_table', SCHEMA);
    const row = await create(ctxFor('userA'), t.id, { title: 'Hi', status: 'Open' });
    const updated = await update(ctxFor('userA'), row.id, { title: 'Hi2' });
    expect((updated.data as any).derived).toBe('COMPUTED_BY_PLUGIN');
  });
});

describe('Governance: noOverlap (anti-overlap intervals)', () => {
  const SCHEMA = {
    fields: [
      { name: 'room', label: 'Room', type: 'string', required: true },
      { name: 'startAt', label: 'Start', type: 'datetime', required: true },
      { name: 'endAt', label: 'End', type: 'datetime', required: true },
    ],
    noOverlap: [{ startField: 'startAt', endField: 'endAt', scopeFields: ['room'] }],
  };
  it('rejects an overlapping interval in the same scope', async () => {
    await seedUser('userA');
    const t = await seedTable('userA', 'noov_tbl', SCHEMA);
    await create(ctxFor('userA'), t.id, { room: 'A', startAt: '2026-01-01T10:00:00Z', endAt: '2026-01-01T11:00:00Z' });
    await expect(
      create(ctxFor('userA'), t.id, { room: 'A', startAt: '2026-01-01T10:30:00Z', endAt: '2026-01-01T11:30:00Z' })
    ).rejects.toBeInstanceOf(ValidationError);
  });
  it('allows an adjacent (half-open) interval in the same scope', async () => {
    await seedUser('userA');
    const t = await seedTable('userA', 'noov_tbl', SCHEMA);
    await create(ctxFor('userA'), t.id, { room: 'A', startAt: '2026-01-01T10:00:00Z', endAt: '2026-01-01T11:00:00Z' });
    await expect(
      create(ctxFor('userA'), t.id, { room: 'A', startAt: '2026-01-01T11:00:00Z', endAt: '2026-01-01T12:00:00Z' })
    ).resolves.toBeTruthy();
  });
  it('allows an overlapping interval in a DIFFERENT scope (room)', async () => {
    await seedUser('userA');
    const t = await seedTable('userA', 'noov_tbl', SCHEMA);
    await create(ctxFor('userA'), t.id, { room: 'A', startAt: '2026-01-01T10:00:00Z', endAt: '2026-01-01T11:00:00Z' });
    await expect(
      create(ctxFor('userA'), t.id, { room: 'B', startAt: '2026-01-01T10:30:00Z', endAt: '2026-01-01T11:30:00Z' })
    ).resolves.toBeTruthy();
  });
});

// --- Relations + cascade delete -----------------------------------------------------------

async function seedParentChild(userId: string, deleteConstraintType?: string) {
  const parentSchema = {
    fields: [{ name: 'pname', label: 'Name', type: 'string', required: true }],
    ...(deleteConstraintType
      ? { deleteConstraints: [{ type: deleteConstraintType, targetTable: 'child_tbl' }] }
      : {}),
  };
  const parent = await seedTable(userId, 'parent_tbl', parentSchema, 'Parent');
  const childSchema = {
    fields: [
      { name: 'clabel', label: 'Label', type: 'string', required: true },
      { name: 'parentRef', label: 'Parent', type: 'relation', required: true, relation: { targetTable: parent.id } },
    ],
  };
  const child = await seedTable(userId, 'child_tbl', childSchema, 'Child');
  return { parent, child };
}

async function isSoftDeleted(dataId: string): Promise<boolean> {
  const row = await prisma.dynamicTableData.findUnique({ where: { id: dataId } });
  return !!row && row.deletedAt !== null;
}

describe('Relation validation (tenant-safe)', () => {
  it('accepts a relation pointing to an existing row in the target table', async () => {
    await seedUser('userA');
    const { parent, child } = await seedParentChild('userA');
    const p = await create(ctxFor('userA'), parent.id, { pname: 'P1' });
    await expect(create(ctxFor('userA'), child.id, { clabel: 'C1', parentRef: p.id })).resolves.toBeTruthy();
  });

  it('rejects a relation id that does not exist in the target table', async () => {
    await seedUser('userA');
    const { parent, child } = await seedParentChild('userA');
    // parent.id is a valid cuid but is a TABLE id, never a data-row id → not found in target table.
    await expect(create(ctxFor('userA'), child.id, { clabel: 'C1', parentRef: parent.id })).rejects.toBeInstanceOf(ValidationError);
  });

  it('rejects duplicate ids in a multi-relation field', async () => {
    await seedUser('userA');
    const parent = await seedTable('userA', 'parent_tbl', { fields: [{ name: 'pname', label: 'N', type: 'string', required: true }] }, 'Parent');
    const child = await seedTable('userA', 'child_tbl', {
      fields: [
        { name: 'clabel', label: 'L', type: 'string', required: true },
        { name: 'parents', label: 'Parents', type: 'relation', required: true, relation: { targetTable: parent.id, allowMultiple: true } },
      ],
    }, 'Child');
    const p = await create(ctxFor('userA'), parent.id, { pname: 'P1' });
    await expect(create(ctxFor('userA'), child.id, { clabel: 'C', parents: [p.id, p.id] })).rejects.toBeInstanceOf(ValidationError);
  });
});

describe('Delete constraints', () => {
  it('RESTRICT (default) blocks deleting a row referenced by another table', async () => {
    await seedUser('userA');
    const { parent, child } = await seedParentChild('userA'); // no explicit constraint → default RESTRICT
    const p = await create(ctxFor('userA'), parent.id, { pname: 'P1' });
    await create(ctxFor('userA'), child.id, { clabel: 'C1', parentRef: p.id });
    await expect(service.deleteTableData(ctxFor('userA'), p.id)).rejects.toBeInstanceOf(ValidationError);
    expect(await isSoftDeleted(p.id)).toBe(false);
  });

  it('CASCADE soft-deletes the referencing rows along with the parent', async () => {
    await seedUser('userA');
    const { parent, child } = await seedParentChild('userA', 'CASCADE');
    const p = await create(ctxFor('userA'), parent.id, { pname: 'P1' });
    const c = await create(ctxFor('userA'), child.id, { clabel: 'C1', parentRef: p.id });
    await service.deleteTableData(ctxFor('userA'), p.id);
    expect(await isSoftDeleted(p.id)).toBe(true);
    expect(await isSoftDeleted(c.id)).toBe(true);
  });

  it('allows deleting a row that nothing references', async () => {
    await seedUser('userA');
    const { parent } = await seedParentChild('userA');
    const p = await create(ctxFor('userA'), parent.id, { pname: 'Lonely' });
    await service.deleteTableData(ctxFor('userA'), p.id);
    expect(await isSoftDeleted(p.id)).toBe(true);
  });
});

describe('Preset installation (installPresetAsSystem)', () => {
  it('creates all tables and resolves cross-table relations in the 2-pass install', async () => {
    await seedUser('userA');
    const preset = {
      tables: {
        authors: {
          name: 'Authors',
          category: 'people',
          schema: { fields: [{ name: 'name', label: 'Name', type: 'string', required: true }] },
        },
        books: {
          name: 'Books',
          category: 'people',
          schema: {
            fields: [
              { name: 'title', label: 'Title', type: 'string', required: true },
              { name: 'author', label: 'Author', type: 'relation', required: true, relation: { targetTable: '@@PRESET_TABLE_KEY::authors' } },
            ],
          },
        },
      },
    };
    await service.installPresetAsSystem('userA', preset as any);

    const tables = await service.getTablesForUser('userA');
    const authors = tables.find(t => t.internalName === 'authors');
    const books = tables.find(t => t.internalName === 'books');
    expect(authors).toBeTruthy();
    expect(books).toBeTruthy();

    const authorField = (books!.schema as any).fields.find((f: any) => f.name === 'author');
    // The @@PRESET_TABLE_KEY marker must be resolved to the real authors table id.
    expect(authorField.relation.targetTable).toBe(authors!.id);
  });
});
