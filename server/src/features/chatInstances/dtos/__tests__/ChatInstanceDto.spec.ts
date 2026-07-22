/**
 * Unit tests for the chatInstances DTOs (Zod boundary) — pure, no I/O.
 * Locks the list-query caps/coercions, the type enum, and the get-or-create / create shapes.
 */
import {
  ListChatInstancesQuerySchema,
  GetOrCreateChatInstanceSchema,
  CreateChatInstanceSchema,
} from '../ChatInstanceDto';

describe('ListChatInstancesQuerySchema', () => {
  it('applies defaults when empty (page=1, limit=10, no type)', () => {
    expect(ListChatInstancesQuerySchema.parse({})).toEqual({ page: 1, limit: 10 });
  });

  it('coerces numeric strings and accepts a valid type', () => {
    expect(ListChatInstancesQuerySchema.parse({ page: '2', limit: '5', type: 'GENERIC' })).toEqual({
      page: 2,
      limit: 5,
      type: 'GENERIC',
    });
  });

  it('caps limit at 100 (rejects above)', () => {
    expect(ListChatInstancesQuerySchema.safeParse({ limit: 101 }).success).toBe(false);
  });

  it('rejects an unknown type', () => {
    expect(ListChatInstancesQuerySchema.safeParse({ type: 'WIDGET' }).success).toBe(false);
  });
});

describe('GetOrCreateChatInstanceSchema', () => {
  it('accepts a valid payload', () => {
    expect(GetOrCreateChatInstanceSchema.safeParse({ widgetInstanceId: 'w1', type: 'DOCUMENT' }).success).toBe(true);
  });

  it('rejects an empty widgetInstanceId', () => {
    expect(GetOrCreateChatInstanceSchema.safeParse({ widgetInstanceId: '', type: 'DOCUMENT' }).success).toBe(false);
  });

  it('rejects a missing type', () => {
    expect(GetOrCreateChatInstanceSchema.safeParse({ widgetInstanceId: 'w1' }).success).toBe(false);
  });
});

describe('CreateChatInstanceSchema', () => {
  it('accepts a valid payload and defaults type to DOCUMENT', () => {
    const parsed = CreateChatInstanceSchema.parse({ title: null, widgetInstanceId: 'w1' });
    expect(parsed.type).toBe('DOCUMENT');
  });

  it('rejects a missing widgetInstanceId', () => {
    expect(CreateChatInstanceSchema.safeParse({ title: null }).success).toBe(false);
  });
});
