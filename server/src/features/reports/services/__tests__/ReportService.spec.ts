/**
 * Computation unit tests for ReportService — orchestration logic with ALL externals faked
 * (no OpenAI, no vector store). This is the "computation tests" leg of the gold set for the `reports`
 * capability feature (no Policy/Repository of its own).
 *
 * Covers: Tier-0 (RAG search hard-scoped to the caller's userId), the tool-call → chartData path, the
 * plain-text path, the no-documents path (RAG skipped), and the query-rewrite fallback resilience.
 */
import { ReportService } from '../ReportService';

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


const USER = 'user_A';

function makeService() {
  const embedding = { embedText: jest.fn().mockResolvedValue([0.1, 0.2, 0.3]) };
  const vector = { search: jest.fn().mockResolvedValue([]) };
  const openai = {
    getChatCompletion: jest.fn().mockResolvedValue('refined query'), // used by _rewriteQueryForSearch
    getChatCompletionWithTools: jest.fn().mockResolvedValue({ content: 'text answer', tool_calls: [] }),
  };
  const service = new ReportService(embedding as any, vector as any, openai as any);
  return { service, embedding, vector, openai };
}

const toolResponse = (args: object) => ({
  tool_calls: [{ function: { name: 'generate_chart_data', arguments: JSON.stringify(args) } }],
});

describe('RAG (documentIds present)', () => {
  it('hard-scopes the vector search to the caller userId (Tier-0)', async () => {
    const { service, vector, openai } = makeService();
    vector.search.mockResolvedValue([{ payload: { textContent: 'ctx' }, score: 0.9 }]);

    await service.generateReport({ query: 'q', chatInstanceId: 'ci', documentIds: ['d1', 'd2'], userId: USER });

    // Tier-0: search(embedding, userId, 15, documentIds) — never another tenant's id.
    expect(vector.search).toHaveBeenCalledWith([0.1, 0.2, 0.3], 15, ['d1', 'd2'], USER);
    expect(openai.getChatCompletionWithTools).toHaveBeenCalled();
  });

  it('returns chartData when the model calls the generate_chart_data tool', async () => {
    const { service, vector, openai } = makeService();
    vector.search.mockResolvedValue([{ payload: { textContent: 'ctx' }, score: 0.9 }]);
    const data = [{ name: 'Jan', value: 10 }, { name: 'Feb', value: 20 }];
    openai.getChatCompletionWithTools.mockResolvedValue(toolResponse({ title: 'Sales', chartType: 'bar', data }));

    const res = await service.generateReport({ query: 'chart it', chatInstanceId: 'ci', documentIds: ['d1'], userId: USER });

    expect(res.chartData).toEqual(data);
    expect(res.response).toContain('Sales');
  });

  it('falls back to the original query if the rewrite step fails (resilience)', async () => {
    const { service, vector, openai } = makeService();
    openai.getChatCompletion.mockRejectedValue(new Error('rewrite down'));
    vector.search.mockResolvedValue([]);

    const res = await service.generateReport({ query: 'q', chatInstanceId: 'ci', documentIds: ['d1'], userId: USER });

    // The report still completes; the rewrite failure is swallowed and the search still runs.
    expect(vector.search).toHaveBeenCalledWith([0.1, 0.2, 0.3], 15, ['d1'], USER);
    expect(res.response).toBe('text answer');
  });
});

describe('no documents (RAG skipped)', () => {
  it('does not touch the vector store and returns the text answer', async () => {
    const { service, vector, openai } = makeService();
    openai.getChatCompletionWithTools.mockResolvedValue({ content: 'no-doc answer', tool_calls: [] });

    const res = await service.generateReport({ query: 'hi', chatInstanceId: 'ci', userId: USER });

    expect(vector.search).not.toHaveBeenCalled();
    expect(res.response).toBe('no-doc answer');
    expect(res.chartData).toBeUndefined();
  });
});
