/**
 * Unit tests for the chatMessages DTOs (Zod boundary) — pure, no I/O.
 *
 * Locks: content length bounds, chatInstanceId as cuid, the additive list-query caps, and the
 * intentional ABSENCE of `role` on create (REST creation is always a USER message — a client-sent
 * role must not be honored).
 */
import { CreateChatMessageSchema, ListChatMessagesQuerySchema } from '../ChatMessageDto';

const CUID = 'cl00000000000000000000000';

describe('CreateChatMessageSchema', () => {
  it('accepts a valid message', () => {
    expect(CreateChatMessageSchema.safeParse({ content: 'hi', chatInstanceId: CUID }).success).toBe(true);
  });

  it('accepts optional documentIds', () => {
    expect(
      CreateChatMessageSchema.safeParse({ content: 'hi', chatInstanceId: CUID, documentIds: ['d1'] }).success
    ).toBe(true);
  });

  it('does NOT honor a client-sent role (stripped — creation is always USER)', () => {
    const parsed = CreateChatMessageSchema.parse({ content: 'hi', chatInstanceId: CUID, role: 'assistant' });
    expect(parsed).not.toHaveProperty('role');
  });

  it('rejects empty content', () => {
    expect(CreateChatMessageSchema.safeParse({ content: '', chatInstanceId: CUID }).success).toBe(false);
  });

  it('rejects content over 4000 chars', () => {
    expect(CreateChatMessageSchema.safeParse({ content: 'x'.repeat(4001), chatInstanceId: CUID }).success).toBe(false);
  });

  it('rejects a non-cuid chatInstanceId', () => {
    expect(CreateChatMessageSchema.safeParse({ content: 'hi', chatInstanceId: 'nope' }).success).toBe(false);
  });
});

describe('ListChatMessagesQuerySchema', () => {
  it('requires a cuid instanceId and defaults page/pageSize', () => {
    expect(ListChatMessagesQuerySchema.parse({ instanceId: CUID })).toEqual({ instanceId: CUID, page: 1, pageSize: 20 });
  });

  it('rejects a missing/invalid instanceId', () => {
    expect(ListChatMessagesQuerySchema.safeParse({}).success).toBe(false);
    expect(ListChatMessagesQuerySchema.safeParse({ instanceId: 'nope' }).success).toBe(false);
  });

  it('caps pageSize at 100', () => {
    expect(ListChatMessagesQuerySchema.safeParse({ instanceId: CUID, pageSize: 101 }).success).toBe(false);
  });
});
