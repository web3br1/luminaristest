/**
 * Unit tests for the structuredData DTOs (Zod boundary) — pure, no I/O.
 *
 * Locks the shape constraints that matter: header name regex + type enum, documentId as cuid, and the
 * three accepted `data` formats (tabular / multi-sheet / arbitrary object). Part of the gold test set.
 */
import { createStructuredDataSchema, updateStructuredDataSchema, headerSchema } from '../StructuredDataDto';

const CUID = 'cl00000000000000000000000';

describe('headerSchema', () => {
  it('accepts a valid header', () => {
    expect(headerSchema.safeParse({ name: 'Produto', type: 'TEXT' }).success).toBe(true);
  });

  it('rejects a name starting with a digit (regex)', () => {
    expect(headerSchema.safeParse({ name: '1coluna', type: 'TEXT' }).success).toBe(false);
  });

  it('rejects an empty name', () => {
    expect(headerSchema.safeParse({ name: '', type: 'TEXT' }).success).toBe(false);
  });

  it('rejects an unknown type', () => {
    expect(headerSchema.safeParse({ name: 'Col', type: 'BOOLEAN' }).success).toBe(false);
  });
});

describe('createStructuredDataSchema', () => {
  const valid = {
    documentId: CUID,
    headers: [{ name: 'Produto', type: 'TEXT' }],
    data: [['Notebook', 5000]],
  };

  it('accepts a valid tabular payload', () => {
    expect(createStructuredDataSchema.safeParse(valid).success).toBe(true);
  });

  it('rejects a non-cuid documentId', () => {
    expect(createStructuredDataSchema.safeParse({ ...valid, documentId: 'not-a-cuid' }).success).toBe(false);
  });

  it('rejects an invalid header inside the array', () => {
    expect(
      createStructuredDataSchema.safeParse({ ...valid, headers: [{ name: 'ok', type: 'WUT' }] }).success
    ).toBe(false);
  });
});

describe('updateStructuredDataSchema (the three data formats)', () => {
  it('accepts simple tabular data', () => {
    expect(updateStructuredDataSchema.safeParse({ data: [['a', 1], ['b', 2]] }).success).toBe(true);
  });

  it('accepts multi-sheet data', () => {
    const multi = {
      data: [{ name: 'S1', headers: [{ key: 'k', title: 't', type: 'TEXT' }], data: [['x', 1]] }],
    };
    expect(updateStructuredDataSchema.safeParse(multi).success).toBe(true);
  });

  it('accepts an arbitrary JSON object', () => {
    expect(updateStructuredDataSchema.safeParse({ data: { anything: 'goes', n: 1 } }).success).toBe(true);
  });

  it('rejects a payload missing the data field', () => {
    expect(updateStructuredDataSchema.safeParse({}).success).toBe(false);
  });
});
