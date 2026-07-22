/**
 * Integration tests for ChatMessageService — real SQLite with the real message repository, the real
 * ChatInstanceRepository (ownership source) and the real policy.
 *
 * Covers: ownership of the parent ChatInstance gates every operation (Tier-0), REST creation always
 * writes a USER message, assistant messages are not client-editable, and the typed-error contract.
 *
 * Run via `npm run test:integration`.
 */
import { ChatMessageService } from '../ChatMessageService';
import { ChatMessageRepository } from '../../repositories/ChatMessageRepository';
import { ChatInstanceRepository } from '../../../chatInstances/repositories/ChatInstanceRepository';
import { ChatMessagePolicy } from '../../policies/ChatMessagePolicy';
import { ChatMessageRole } from '../../models/ChatMessage.model';
import { ForbiddenError, NotFoundError, UnauthorizedError } from '@/lib/errors';
import {
  pushTestSchema,
  resetDb,
  disconnectDb,
  seedUser,
  seedChatInstance,
  ctxFor,
} from '@test/helpers';

const service = new ChatMessageService(
  new ChatMessageRepository(),
  new ChatInstanceRepository(),
  new ChatMessagePolicy()
);

beforeAll(() => {
  pushTestSchema();
}, 120000);

afterEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await disconnectDb();
});

describe('createMessage (Tier-0 via instance ownership)', () => {
  it('persists a USER message in the owner instance (role is forced to USER)', async () => {
    const u = await seedUser({ username: 'owner' });
    const ci = await seedChatInstance({ userId: u.id });
    const msg = await service.createMessage(
      { content: 'hello', chatInstanceId: ci.id },
      ctxFor({ id: u.id, username: u.username })
    );
    expect(msg.content).toBe('hello');
    expect(msg.role).toBe(ChatMessageRole.USER);
  });

  it('forbids posting to ANOTHER user instance (ForbiddenError)', async () => {
    const owner = await seedUser({ username: 'owner' });
    const stranger = await seedUser({ username: 'stranger' });
    const ci = await seedChatInstance({ userId: owner.id });
    await expect(
      service.createMessage({ content: 'leak', chatInstanceId: ci.id }, ctxFor({ id: stranger.id, username: stranger.username }))
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('throws NotFoundError when the instance does not exist', async () => {
    const u = await seedUser({ username: 'u' });
    await expect(
      service.createMessage({ content: 'hi', chatInstanceId: 'cl00000000000000000000000' }, ctxFor({ id: u.id, username: u.username }))
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('throws UnauthorizedError without a userId', async () => {
    const ctx = { ...ctxFor({ id: 'x', username: 'x' }), userId: '' };
    await expect(
      service.createMessage({ content: 'hi', chatInstanceId: 'cl00000000000000000000000' }, ctx)
    ).rejects.toBeInstanceOf(UnauthorizedError);
  });
});

describe('appendAssistantMessage (server-only)', () => {
  it('persists an ASSISTANT message for the owner instance', async () => {
    const u = await seedUser({ username: 'owner' });
    const ci = await seedChatInstance({ userId: u.id });
    await service.appendAssistantMessage(ci.id, 'the answer', ctxFor({ id: u.id, username: u.username }));

    const { messages } = await service.getMessagesByInstance(ci.id, ctxFor({ id: u.id, username: u.username }));
    expect(messages).toHaveLength(1);
    expect(messages[0].role).toBe(ChatMessageRole.ASSISTANT);
  });

  it('forbids appending to ANOTHER user instance', async () => {
    const owner = await seedUser({ username: 'owner' });
    const stranger = await seedUser({ username: 'stranger' });
    const ci = await seedChatInstance({ userId: owner.id });
    await expect(
      service.appendAssistantMessage(ci.id, 'x', ctxFor({ id: stranger.id, username: stranger.username }))
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe('getMessagesByInstance (Tier-0)', () => {
  it('lets the owner read the thread in chronological order', async () => {
    const u = await seedUser({ username: 'owner' });
    const ci = await seedChatInstance({ userId: u.id });
    const ctx = ctxFor({ id: u.id, username: u.username });
    await service.createMessage({ content: 'first', chatInstanceId: ci.id }, ctx);
    await service.appendAssistantMessage(ci.id, 'second', ctx);

    const { messages, total } = await service.getMessagesByInstance(ci.id, ctx);
    expect(total).toBe(2);
    expect(messages.map((m) => m.content)).toEqual(['first', 'second']);
  });

  it('forbids reading ANOTHER user instance thread', async () => {
    const owner = await seedUser({ username: 'owner' });
    const stranger = await seedUser({ username: 'stranger' });
    const ci = await seedChatInstance({ userId: owner.id });
    await expect(
      service.getMessagesByInstance(ci.id, ctxFor({ id: stranger.id, username: stranger.username }))
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('throws NotFoundError for a missing instance', async () => {
    const u = await seedUser({ username: 'u' });
    await expect(
      service.getMessagesByInstance('cl00000000000000000000000', ctxFor({ id: u.id, username: u.username }))
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('paginates additively when opts are passed', async () => {
    const u = await seedUser({ username: 'owner' });
    const ci = await seedChatInstance({ userId: u.id });
    const ctx = ctxFor({ id: u.id, username: u.username });
    for (const c of ['a', 'b', 'c']) await service.createMessage({ content: c, chatInstanceId: ci.id }, ctx);

    const { messages, total } = await service.getMessagesByInstance(ci.id, ctx, { skip: 0, take: 2 });
    expect(total).toBe(3);
    expect(messages).toHaveLength(2);
  });
});

describe('updateMessage — assistant replies are not client-editable', () => {
  it('forbids editing an ASSISTANT message, even by the instance owner', async () => {
    const u = await seedUser({ username: 'owner' });
    const ci = await seedChatInstance({ userId: u.id });
    const ctx = ctxFor({ id: u.id, username: u.username });
    await service.appendAssistantMessage(ci.id, 'ai reply', ctx);
    const { messages } = await service.getMessagesByInstance(ci.id, ctx);
    const assistantId = messages[0].id;

    await expect(service.updateMessage(assistantId, { content: 'tampered' }, ctx)).rejects.toBeInstanceOf(
      ForbiddenError
    );
  });
});
