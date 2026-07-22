/**
 * Computation unit tests for ChatService — the orchestration logic, with ALL external dependencies
 * faked (no OpenAI, no vector store, no DB). This is the "computation tests" leg of the gold set for a
 * non-CRUD capability feature (chat has no Policy/Repository of its own).
 *
 * Covers: RAG vs Agent mode selection, the Tier-0 invariant (vector search scoped to the caller's
 * userId; proposals executed for the caller), action proposals, and the server-owned persistence
 * orchestration (user message before generation, assistant reply best-effort after).
 */
import { ChatService } from '../ChatService';
import type { UserContext } from '@/lib/authUtils';
import { Role } from '@/features/users/models/User.model';
import { ForbiddenError } from '@/lib/errors';

// The RAG ownership guard (Tier-0) queries the Prisma singleton directly; in unit tests every
// requested documentId is treated as owned by the caller (the guard's own denial path is covered
// by the integration suite against the real DB).
jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    document: {
      findMany: jest.fn(async (args: { where: { id: { in: string[] } } }) =>
        args.where.id.in.map((id: string) => ({ id }))),
    },
  },
}));


const user: UserContext = {
  id: 'user_A', userId: 'user_A', name: 'A', username: 'a', email: 'a@test.co', userEmail: 'a@test.co',
  role: Role.USER, userRole: Role.USER, createdAt: new Date(), updatedAt: new Date(),
};

/** Builds a ChatService with fresh fakes for every collaborator; tests configure them per case. */
function makeService() {
  const embedding = { embedText: jest.fn().mockResolvedValue([0.1, 0.2, 0.3]) };
  const vector = { search: jest.fn().mockResolvedValue([]) };
  const openai = {
    getChatCompletion: jest.fn().mockResolvedValue('answer'),
    getChatCompletionWithToolsAndHistory: jest.fn().mockResolvedValue({ content: 'answer', tool_calls: [] }),
    getChatCompletionWithHistory: jest.fn().mockResolvedValue('answer'),
  };
  const agent = {
    getTools: jest.fn().mockResolvedValue([]),
    handleToolCall: jest.fn(),
    executeProposal: jest.fn(),
    getProposal: jest.fn(),
  };
  const graph = { getGraphPrompt: jest.fn().mockResolvedValue('GRAPH PROMPT') };
  const messages = { createMessage: jest.fn().mockResolvedValue(undefined), appendAssistantMessage: jest.fn().mockResolvedValue(undefined) };

  const service = new ChatService(
    embedding as any, vector as any, openai as any, agent as any, graph as any, messages as any
  );
  return { service, embedding, vector, openai, agent, graph, messages };
}

describe('RAG mode (documentIds present)', () => {
  it('searches scoped to the caller userId and returns the answer + sources (Tier-0)', async () => {
    const { service, embedding, vector, openai } = makeService();
    vector.search.mockResolvedValue([
      { id: 'v1', score: 0.9, payload: { documentId: 'd1', userId: 'user_A', textContent: 'context', fileName: 'f', chunkId: 'c', index: 0 } },
    ]);
    openai.getChatCompletion.mockResolvedValue('Grounded answer');

    const res = await service.generateResponse({ query: 'q', documentIds: ['d1'], user });

    expect(res.type).toBe('TEXT');
    expect(res.answer).toBe('Grounded answer');
    expect(res.sourceDocuments).toHaveLength(1);
    expect(embedding.embedText).toHaveBeenCalled();
    // Tier-0: the search MUST be scoped to the caller and the requested docs.
    expect(vector.search).toHaveBeenCalledWith(expect.anything(), 10, ['d1'], 'user_A');
  });

  it('returns a no-results message when nothing is found (and does not call the LLM)', async () => {
    const { service, vector, openai } = makeService();
    vector.search.mockResolvedValue([]);

    const res = await service.generateResponse({ query: 'q', documentIds: ['d1'], user });

    expect(res.answer).toMatch(/não encontrei/i);
    expect(res.sourceDocuments).toEqual([]);
    expect(openai.getChatCompletion).not.toHaveBeenCalled();
  });
});

describe('Agent mode (no documentIds)', () => {
  it('returns the model text answer when no tool is called', async () => {
    const { service, openai, graph } = makeService();
    openai.getChatCompletionWithToolsAndHistory.mockResolvedValue({ content: 'Agent answer', tool_calls: [] });

    const res = await service.generateResponse({ query: 'hi', user });

    expect(res.answer).toBe('Agent answer');
    expect(res.type).toBe('TEXT');
    expect(graph.getGraphPrompt).toHaveBeenCalledWith('user_A');
  });

  it('returns an ACTION_PROPOSAL when a tool call proposes an action', async () => {
    const { service, openai, agent } = makeService();
    openai.getChatCompletionWithToolsAndHistory.mockResolvedValue({
      tool_calls: [{ id: 't1', function: { name: 'request_record_creation', arguments: '{}' } }],
    });
    agent.handleToolCall.mockResolvedValue({ status: 'PROPOSED', proposalId: 'p1' });
    agent.getProposal.mockResolvedValue({ id: 'p1', action: 'CREATE', tableName: 'sales', tableLabel: 'Sales', data: {} });

    const res = await service.generateResponse({ query: 'create a sale', user });

    expect(res.type).toBe('ACTION_PROPOSAL');
    expect(res.proposal?.id).toBe('p1');
    expect(res.proposal?.tableName).toBe('sales');
  });
});

describe('confirmed proposal', () => {
  it('executes the proposal for the caller and returns a success message (Tier-0)', async () => {
    const { service, agent } = makeService();
    agent.executeProposal.mockResolvedValue({ result: { id: 'rec_1' } });

    const res = await service.generateResponse({ confirmedProposalId: 'p1', user });

    expect(res.type).toBe('TEXT');
    expect(res.answer).toContain('rec_1');
    expect(agent.executeProposal).toHaveBeenCalledWith(user, 'p1');
  });
});

describe('conversation persistence (server-owned)', () => {
  it('persists the user message, then the assistant reply, when a chatInstanceId is present', async () => {
    const { service, openai, messages } = makeService();
    openai.getChatCompletionWithToolsAndHistory.mockResolvedValue({ content: 'ok', tool_calls: [] });

    await service.generateResponse({ query: 'hi', chatInstanceId: 'ci_1', user });

    expect(messages.createMessage).toHaveBeenCalledWith({ content: 'hi', chatInstanceId: 'ci_1' }, user);
    expect(messages.appendAssistantMessage).toHaveBeenCalledWith('ci_1', 'ok', user);
  });

  it('still returns the answer if persisting the assistant reply fails (best-effort)', async () => {
    const { service, openai, messages } = makeService();
    openai.getChatCompletionWithToolsAndHistory.mockResolvedValue({ content: 'ok', tool_calls: [] });
    messages.appendAssistantMessage.mockRejectedValue(new Error('db hiccup'));

    const res = await service.generateResponse({ query: 'hi', chatInstanceId: 'ci_1', user });

    expect(res.answer).toBe('ok');
  });

  it('propagates an ownership error from the user message and never reaches the model (Tier-0)', async () => {
    const { service, messages, openai } = makeService();
    messages.createMessage.mockRejectedValue(new ForbiddenError('not your instance'));

    await expect(
      service.generateResponse({ query: 'hi', chatInstanceId: 'ci_other', user })
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(openai.getChatCompletionWithToolsAndHistory).not.toHaveBeenCalled();
  });
});
