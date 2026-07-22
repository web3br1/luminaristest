/**
 * Unit tests for the dynamicTables DTO boundary (pure, no I/O).
 *
 * Focuses on what the Zod schemas must REJECT — the table-definition validation that protects the
 * system before a schema is ever persisted. Note the deliberate variant: the DATA DTOs
 * (Create/UpdateDynamicTableDataDto) are intentionally loose (`z.record(string, any)`) because the
 * real per-record validation is dynamic, against the table's own schema (SchemaValidator). So here
 * we lock the *table definition* schema, not the data payload.
 */
import {
  CreateDynamicTableDto,
  UpdateDynamicTableSchemaDto,
  CreateDynamicTableDataDto,
} from '../DynamicTable.dto';

const field = (over: Record<string, unknown> = {}) => ({
  name: 'amount',
  label: 'Amount',
  type: 'number',
  required: true,
  ...over,
});

const makeTable = (fields: unknown[], extra: Record<string, unknown> = {}) => ({
  name: 'Finance',
  category: 'finance',
  schema: { fields, ...extra },
});

describe('CreateDynamicTableDto — table & field shape', () => {
  it('accepts a minimal valid table', () => {
    const parsed = CreateDynamicTableDto.safeParse(
      makeTable([{ name: 'title', label: 'Title', type: 'string', required: true }]),
    );
    expect(parsed.success).toBe(true);
  });

  it('rejects a table with no fields', () => {
    expect(CreateDynamicTableDto.safeParse(makeTable([])).success).toBe(false);
  });

  it('rejects an invalid category', () => {
    const bad = { ...makeTable([field()]), category: 'not-a-category' };
    expect(CreateDynamicTableDto.safeParse(bad).success).toBe(false);
  });

  it('rejects a too-short table name (< 2 chars)', () => {
    const bad = { ...makeTable([field()]), name: 'A' };
    expect(CreateDynamicTableDto.safeParse(bad).success).toBe(false);
  });

  it('rejects a reserved field name (id/createdAt/updatedAt/userId)', () => {
    for (const reserved of ['id', 'createdAt', 'updatedAt', 'userId']) {
      const res = CreateDynamicTableDto.safeParse(makeTable([field({ name: reserved })]));
      expect(res.success).toBe(false);
    }
  });

  it('rejects a field name with invalid characters', () => {
    expect(CreateDynamicTableDto.safeParse(makeTable([field({ name: '1bad-name' })])).success).toBe(
      false,
    );
  });

  it('rejects a select field without options', () => {
    const res = CreateDynamicTableDto.safeParse(
      makeTable([field({ type: 'select', options: [] })]),
    );
    expect(res.success).toBe(false);
  });

  it('rejects a relation field without a relation object', () => {
    const res = CreateDynamicTableDto.safeParse(makeTable([field({ type: 'relation' })]));
    expect(res.success).toBe(false);
  });

  it('rejects a relation object on a non-relation field', () => {
    const res = CreateDynamicTableDto.safeParse(
      makeTable([field({ type: 'string', relation: { targetTable: 'tbl-x' } })]),
    );
    expect(res.success).toBe(false);
  });

  it('rejects a required field that also declares a defaultValue', () => {
    const res = CreateDynamicTableDto.safeParse(
      makeTable([field({ required: true, defaultValue: 0 })]),
    );
    expect(res.success).toBe(false);
  });

  it('dedupes and trims select options', () => {
    const res = CreateDynamicTableDto.safeParse(
      makeTable([field({ type: 'select', required: false, options: [' A ', 'A', 'B'] })]),
    );
    expect(res.success).toBe(true);
    if (res.success) {
      const opts = (res.data.schema.fields[0] as { options: string[] }).options;
      expect(opts).toEqual(['A', 'B']);
    }
  });
});

describe('CreateDynamicTableDto — table-level governance metadata', () => {
  it('accepts immutableAfter / compare / noOverlap / compositeUnique blocks', () => {
    const res = CreateDynamicTableDto.safeParse(
      makeTable(
        [
          { name: 'status', label: 'Status', type: 'select', required: true, options: ['Open', 'Paid'] },
          { name: 'startAt', label: 'Start', type: 'datetime', required: true },
          { name: 'endAt', label: 'End', type: 'datetime', required: true },
        ],
        {
          immutableAfter: [{ condition: { field: 'status', op: 'eq', value: 'Paid' }, scope: 'all' }],
          compare: [{ left: 'endAt', op: 'gt', right: 'startAt' }],
          noOverlap: [{ startField: 'startAt', endField: 'endAt' }],
          compositeUnique: [{ fields: ['status', 'startAt'] }],
        },
      ),
    );
    expect(res.success).toBe(true);
  });

  it('rejects a deleteConstraint with an unknown type', () => {
    const res = CreateDynamicTableDto.safeParse(
      makeTable([field()], { deleteConstraints: [{ type: 'NOPE', targetTable: 'x' }] }),
    );
    expect(res.success).toBe(false);
  });

  it('rejects a compositeUnique rule with no fields', () => {
    const res = CreateDynamicTableDto.safeParse(
      makeTable([field()], { compositeUnique: [{ fields: [] }] }),
    );
    expect(res.success).toBe(false);
  });
});

describe('UpdateDynamicTableSchemaDto', () => {
  it('requires a schema with at least one field', () => {
    expect(UpdateDynamicTableSchemaDto.safeParse({ schema: { fields: [] } }).success).toBe(false);
    expect(
      UpdateDynamicTableSchemaDto.safeParse({
        schema: { fields: [{ name: 'a', label: 'A', type: 'string', required: false }] },
      }).success,
    ).toBe(true);
  });
});

describe('CreateDynamicTableDataDto — intentionally loose (validated dynamically downstream)', () => {
  it('accepts an arbitrary data record', () => {
    expect(CreateDynamicTableDataDto.safeParse({ data: { anything: 1, nested: { x: 'y' } } }).success).toBe(
      true,
    );
  });
  it('rejects a missing data object', () => {
    expect(CreateDynamicTableDataDto.safeParse({}).success).toBe(false);
  });
});
