/**
 * Unit tests for the reports DTO (Zod boundary) — pure, no I/O.
 * Locks: non-empty query, chatInstanceId as cuid (required), documentIds optional array of cuids.
 */
import { GenerateReportSchema } from '../GenerateReportDto';

const CUID = 'cl00000000000000000000000';

describe('GenerateReportSchema', () => {
  const valid = { query: 'monthly sales chart', chatInstanceId: CUID };

  it('accepts a valid payload', () => {
    expect(GenerateReportSchema.safeParse(valid).success).toBe(true);
  });

  it('accepts optional documentIds (array of cuids)', () => {
    expect(GenerateReportSchema.safeParse({ ...valid, documentIds: [CUID] }).success).toBe(true);
  });

  it('rejects an empty query', () => {
    expect(GenerateReportSchema.safeParse({ ...valid, query: '' }).success).toBe(false);
  });

  it('rejects a missing/invalid chatInstanceId', () => {
    expect(GenerateReportSchema.safeParse({ query: 'q' }).success).toBe(false);
    expect(GenerateReportSchema.safeParse({ ...valid, chatInstanceId: 'nope' }).success).toBe(false);
  });

  it('rejects documentIds that are not cuids', () => {
    expect(GenerateReportSchema.safeParse({ ...valid, documentIds: ['not-a-cuid'] }).success).toBe(false);
  });
});
