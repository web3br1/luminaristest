/**
 * Unit tests for the chat DTOs (the Zod validation boundary) — pure, no I/O.
 *
 * The request schema is intentionally permissive (every field optional), so the value here is locking
 * the SHAPE constraints that DO exist — history item shape, the role enum, array typings — and the
 * response schema's `type` default. Part of the gold test set (DTO unit) for the `chat` capability.
 */
import { ChatRequestSchema, ChatResponseSchema } from '../ChatDto';

describe('ChatRequestSchema', () => {
  it('accepts an empty object (all fields optional)', () => {
    expect(ChatRequestSchema.safeParse({}).success).toBe(true);
  });

  it('accepts a typical request', () => {
    const ok = ChatRequestSchema.safeParse({
      query: 'how many sales this month?',
      documentIds: ['doc_1', 'doc_2'],
      history: [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'hello' }],
      chatInstanceId: 'ci_1',
    });
    expect(ok.success).toBe(true);
  });

  it('rejects a history that is not an array', () => {
    expect(ChatRequestSchema.safeParse({ history: 'nope' }).success).toBe(false);
  });

  it('rejects a history item with an invalid role', () => {
    expect(ChatRequestSchema.safeParse({ history: [{ role: 'robot', content: 'x' }] }).success).toBe(false);
  });

  it('rejects a history item missing content', () => {
    expect(ChatRequestSchema.safeParse({ history: [{ role: 'user' }] }).success).toBe(false);
  });

  it('rejects documentIds that are not an array of strings', () => {
    expect(ChatRequestSchema.safeParse({ documentIds: 'doc_1' }).success).toBe(false);
    expect(ChatRequestSchema.safeParse({ documentIds: [1, 2] }).success).toBe(false);
  });
});

describe('ChatResponseSchema', () => {
  it('defaults type to TEXT when omitted', () => {
    const parsed = ChatResponseSchema.parse({ answer: 'hello' });
    expect(parsed.type).toBe('TEXT');
  });

  it('accepts an ACTION_PROPOSAL with proposal metadata', () => {
    const ok = ChatResponseSchema.safeParse({
      answer: 'proposing…',
      type: 'ACTION_PROPOSAL',
      proposal: { id: 'p1', action: 'CREATE', tableName: 'sales', tableLabel: 'Sales', data: {} },
    });
    expect(ok.success).toBe(true);
  });

  it('requires an answer', () => {
    expect(ChatResponseSchema.safeParse({ type: 'TEXT' }).success).toBe(false);
  });

  it('rejects an unknown response type', () => {
    expect(ChatResponseSchema.safeParse({ answer: 'x', type: 'WEIRD' }).success).toBe(false);
  });
});
