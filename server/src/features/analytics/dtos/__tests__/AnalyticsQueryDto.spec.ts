/**
 * Unit tests for the analytics query DTOs (Zod boundary) — pure, no I/O.
 * Completes the analytics gold set (the KPI computation is already covered by the engine/processor
 * specs). Locks the boundary parsing: required keys, coercions, caps, and enum constraints.
 */
import { ChartDataQuerySchema, ChartDetailsQuerySchema, DrillDownQuerySchema } from '../AnalyticsQueryDto';

describe('ChartDataQuerySchema', () => {
  it('requires a non-empty key', () => {
    expect(ChartDataQuerySchema.safeParse({ key: 'revenue' }).success).toBe(true);
    expect(ChartDataQuerySchema.safeParse({ key: '' }).success).toBe(false);
    expect(ChartDataQuerySchema.safeParse({}).success).toBe(false);
  });

  it('passes through extra params (forwarded to the resolver)', () => {
    const parsed = ChartDataQuerySchema.parse({ key: 'revenue', tableId: 't1', month: '3' });
    expect(parsed).toMatchObject({ key: 'revenue', tableId: 't1', month: '3' });
  });
});

describe('ChartDetailsQuerySchema', () => {
  it('applies defaults (page=1, limit=50, sortOrder=desc)', () => {
    expect(ChartDetailsQuerySchema.parse({})).toMatchObject({ page: 1, limit: 50, sortOrder: 'desc' });
  });

  it('coerces numeric strings and caps limit at 1000', () => {
    expect(ChartDetailsQuerySchema.parse({ page: '2', limit: '100' })).toMatchObject({ page: 2, limit: 100 });
    expect(ChartDetailsQuerySchema.safeParse({ limit: 1001 }).success).toBe(false);
  });

  it('rejects an invalid sortOrder', () => {
    expect(ChartDetailsQuerySchema.safeParse({ sortOrder: 'sideways' }).success).toBe(false);
  });
});

describe('DrillDownQuerySchema', () => {
  it('requires a tableId and defaults recordIds/fields/page/limit', () => {
    expect(DrillDownQuerySchema.parse({ tableId: 't1' })).toMatchObject({
      tableId: 't1',
      recordIds: '',
      fields: '',
      page: 1,
      limit: 20,
    });
  });

  it('rejects a missing tableId', () => {
    expect(DrillDownQuerySchema.safeParse({}).success).toBe(false);
  });

  it('caps limit at 1000', () => {
    expect(DrillDownQuerySchema.safeParse({ tableId: 't1', limit: 1001 }).success).toBe(false);
  });
});
