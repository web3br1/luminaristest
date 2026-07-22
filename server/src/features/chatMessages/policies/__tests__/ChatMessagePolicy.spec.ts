/**
 * Unit tests for ChatMessagePolicy — pure authorization (no I/O).
 *
 * Messages are owned via their ChatInstance owner (`message.userId`, populated by the service).
 * The distinguishing rule: edit/delete are **USER-role only** — assistant messages can never be
 * edited or deleted by the client, even by their owner.
 */
import { ChatMessagePolicy } from '../ChatMessagePolicy';
import { ChatMessageRole } from '../../models/ChatMessage.model';
import type { IChatMessage } from '../../models/ChatMessage.model';
import type { UserContext } from '@/types/UserContext';
import { Role } from '../../../users/models/User.model';

const policy = new ChatMessagePolicy();

const ctx = (userId: string): UserContext => ({
  id: userId,
  userId,
  name: 'n',
  username: 'u',
  email: 'u@test.co',
  userEmail: 'u@test.co',
  role: Role.USER,
  userRole: Role.USER,
  createdAt: new Date(),
  updatedAt: new Date(),
});

const msg = (role: ChatMessageRole, userId = 'owner-1'): IChatMessage =>
  ({ id: 'm1', content: 'c', role, chatInstanceId: 'ci', userId, createdAt: new Date(), updatedAt: new Date() });

describe('canCreate / canListAll', () => {
  it('allow any authenticated user', () => {
    expect(policy.canCreate(ctx('u'))).toBe(true);
    expect(policy.canListAll(ctx('u'))).toBe(true);
  });
  it('deny a caller without userId', () => {
    expect(policy.canCreate(ctx(''))).toBe(false);
    expect(policy.canListAll(ctx(''))).toBe(false);
  });
});

describe('canView (owner)', () => {
  it('allows the owner', () => expect(policy.canView(ctx('owner-1'), msg(ChatMessageRole.USER))).toBe(true));
  it('denies another user', () => expect(policy.canView(ctx('stranger'), msg(ChatMessageRole.USER))).toBe(false));
  it('denies when message has no resolved userId', () => {
    const orphan = { ...msg(ChatMessageRole.USER), userId: undefined } as IChatMessage;
    expect(policy.canView(ctx('owner-1'), orphan)).toBe(false);
  });
});

describe('canUpdate / canDelete (USER-role only, owner)', () => {
  it('allow the owner to edit/delete their own USER message', () => {
    expect(policy.canUpdate(ctx('owner-1'), msg(ChatMessageRole.USER))).toBe(true);
    expect(policy.canDelete(ctx('owner-1'), msg(ChatMessageRole.USER))).toBe(true);
  });

  it('FORBID editing/deleting an ASSISTANT message, even by its owner', () => {
    expect(policy.canUpdate(ctx('owner-1'), msg(ChatMessageRole.ASSISTANT))).toBe(false);
    expect(policy.canDelete(ctx('owner-1'), msg(ChatMessageRole.ASSISTANT))).toBe(false);
  });

  it('deny another user even for a USER message', () => {
    expect(policy.canUpdate(ctx('stranger'), msg(ChatMessageRole.USER))).toBe(false);
    expect(policy.canDelete(ctx('stranger'), msg(ChatMessageRole.USER))).toBe(false);
  });
});
