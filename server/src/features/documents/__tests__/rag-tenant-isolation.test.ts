/**
 * Security regression test: RAG cross-tenant data isolation (R3)
 *
 * Verifies that ChatService.generateResponse() throws ForbiddenError when a
 * user supplies documentIds that do not belong to them, and that the vector
 * store is never queried in that scenario.
 */

import { ChatService } from '@/features/chat/services/ChatService';
import { ForbiddenError } from '@/lib/errors';

// ---------------------------------------------------------------------------
// Mock prisma BEFORE importing ChatService so the module picks up the mock
// ---------------------------------------------------------------------------
jest.mock('@/lib/prisma', () => ({
  __esModule: true,
  default: {
    document: {
      findMany: jest.fn(),
    },
  },
}));

// We also need to prevent the real OpenAI / Qdrant / monitoring from being
// initialised during the test.
jest.mock('@/lib/logger', () => ({
  __esModule: true,
  default: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

jest.mock('@/lib/monitoring', () => ({
  metrics: {
    startTimer: jest.fn(() => jest.fn()),
  },
}));

// ---------------------------------------------------------------------------
// Import the mocked prisma so we can configure return values per test
// ---------------------------------------------------------------------------
import prisma from '@/lib/prisma';
const mockPrisma = prisma as jest.Mocked<typeof prisma>;

// ---------------------------------------------------------------------------
// Build minimal stubs for ChatService constructor dependencies
// ---------------------------------------------------------------------------
const mockEmbeddingService = {
  embedText: jest.fn().mockResolvedValue([0.1, 0.2, 0.3]),
};

const mockVectorRepository = {
  search: jest.fn(),
  searchVectors: jest.fn(),
  upsertChunks: jest.fn(),
  deletePoints: jest.fn(),
  getPointsByDocumentId: jest.fn(),
  deleteVectorsByUserId: jest.fn(),
};

const mockOpenAIService = {
  getChatCompletion: jest.fn(),
  getChatCompletionWithHistory: jest.fn(),
  getChatCompletionWithToolsAndHistory: jest.fn(),
};

const mockAgentService = {
  getTools: jest.fn().mockResolvedValue([]),
  executeProposal: jest.fn(),
  handleToolCall: jest.fn(),
  getProposal: jest.fn(),
};

const mockKnowledgeGraphService = {
  getGraphPrompt: jest.fn().mockResolvedValue(''),
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildChatService(): ChatService {
  return new ChatService(
    mockEmbeddingService as any,
    mockVectorRepository as any,
    mockOpenAIService as any,
    mockAgentService as any,
    mockKnowledgeGraphService as any,
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('RAG cross-tenant data isolation (R3)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('throws ForbiddenError when user-B requests a document owned by user-A', async () => {
    const docA = 'doc-A';
    const userA = 'user-A';
    const userB = 'user-B';

    // Prisma returns 0 rows because doc-A does NOT belong to user-B.
    (mockPrisma.document.findMany as jest.Mock).mockResolvedValue([]);

    const service = buildChatService();

    await expect(
      service.generateResponse({
        query: 'What is in doc-A?',
        documentIds: [docA],
        history: [],
        user: { id: userB, email: 'userb@example.com' } as any,
      }),
    ).rejects.toThrow(ForbiddenError);

    // The vector store must NEVER be contacted when ownership check fails.
    expect(mockVectorRepository.search).not.toHaveBeenCalled();

    // The ownership query must use BOTH the documentIds and the requesting userId.
    expect(mockPrisma.document.findMany).toHaveBeenCalledWith({
      where: { id: { in: [docA] }, userId: userB },
      select: { id: true },
    });
  });

  it('throws ForbiddenError with the correct message text', async () => {
    (mockPrisma.document.findMany as jest.Mock).mockResolvedValue([]);

    const service = buildChatService();

    await expect(
      service.generateResponse({
        query: 'leak',
        documentIds: ['doc-X'],
        history: [],
        user: { id: 'intruder', email: 'intruder@evil.com' } as any,
      }),
    ).rejects.toThrow('One or more documents do not belong to this user');
  });

  it('does NOT throw when user owns all requested documents', async () => {
    const docA = 'doc-A';
    const userA = 'user-A';

    // Prisma returns the document — it belongs to user-A.
    (mockPrisma.document.findMany as jest.Mock).mockResolvedValue([{ id: docA }]);

    // Stub the vector search to return empty (no chunks to show context).
    mockVectorRepository.search.mockResolvedValue([]);

    const service = buildChatService();

    const response = await service.generateResponse({
      query: 'What is in my doc?',
      documentIds: [docA],
      history: [],
      user: { id: userA, email: 'usera@example.com' } as any,
    });

    // Should not throw and should reach the "no results" branch.
    expect(response.answer).toContain('não encontrei informações');
    // Vector store WAS called — ownership passed.
    expect(mockVectorRepository.search).toHaveBeenCalledWith(
      expect.any(Array),
      10,
      [docA],
      userA,
    );
  });

  it('throws ForbiddenError when only some documentIds belong to the user (partial ownership)', async () => {
    const userA = 'user-A';
    const docOwned = 'doc-owned';
    const docForeign = 'doc-foreign';

    // Prisma finds only 1 of the 2 requested docs for this user.
    (mockPrisma.document.findMany as jest.Mock).mockResolvedValue([{ id: docOwned }]);

    const service = buildChatService();

    await expect(
      service.generateResponse({
        query: 'leak',
        documentIds: [docOwned, docForeign],
        history: [],
        user: { id: userA, email: 'usera@example.com' } as any,
      }),
    ).rejects.toThrow(ForbiddenError);

    expect(mockVectorRepository.search).not.toHaveBeenCalled();
  });
});
