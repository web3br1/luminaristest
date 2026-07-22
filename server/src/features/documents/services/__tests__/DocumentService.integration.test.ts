/**
 * Integration tests for DocumentService — business rules against a REAL SQLite DB with the real
 * DocumentRepository and DocumentPolicy. The external stores are faked: Qdrant (IVectorRepository)
 * and the processing/embedding service are mocks, so no network is touched.
 *
 * Covers what the policy unit test can't: Tier-0 (a USER only touches their own docs), the
 * existence-non-leak (404 not 403 for a foreign doc), the typed-error contract, and the privacy-
 * critical delete ordering — vectors are removed from Qdrant BEFORE the SQL row, and a Qdrant
 * failure must leave SQL intact (no orphaned-vector / half-deleted state).
 *
 * Run via `npm run test:integration`.
 */
import { DocumentService } from '../DocumentService';
import { DocumentRepository } from '../../repositories/DocumentRepository';
import { DocumentPolicy } from '../../policies/DocumentPolicy';
import { Role } from '../../../users/models/User.model';
import { NotFoundError, ForbiddenError, UnauthorizedError } from '@/lib/errors';
import { DocumentStatus } from '../../models/Document.model';
import { pushTestSchema, resetDb, disconnectDb, seedUser, seedDocument, ctxFor } from '@test/helpers';

const repo = new DocumentRepository();

/** Per-test fakes for the external collaborators; only the SQL path is real. */
function makeService() {
  const vector = {
    upsertChunks: jest.fn().mockResolvedValue(undefined),
    search: jest.fn().mockResolvedValue([]),
    searchVectors: jest.fn().mockResolvedValue([]),
    deletePointsByDocumentId: jest.fn().mockResolvedValue(undefined),
    getPointsByDocumentId: jest.fn().mockResolvedValue([]),
  };
  const processing = {
    extractText: jest.fn().mockResolvedValue('text'),
    generateEmbedding: jest.fn().mockResolvedValue([0.1, 0.2, 0.3]),
  };
  const service = new DocumentService(
    repo,
    {} as any, // chunkRepository — only used by the async pipeline (not exercised here)
    vector as any,
    processing as any,
    new DocumentPolicy(),
    {} as any, // openAIService — pipeline-only
    {} as any, // structuredDataService — pipeline-only
    {} as any // userRepository — pipeline-only
  );
  return { service, vector, processing };
}

beforeAll(() => {
  pushTestSchema();
}, 120000);

afterEach(async () => {
  await resetDb();
});

afterAll(async () => {
  await disconnectDb();
});

describe('getDocumentById (Tier-0)', () => {
  it('lets the owner read their OWN document', async () => {
    const { service } = makeService();
    const owner = await seedUser({ username: 'owner' });
    const doc = await seedDocument({ userId: owner.id, fileName: 'mine.pdf' });

    const got = await service.getDocumentById(doc.id, ctxFor({ id: owner.id, username: owner.username }));
    expect(got.id).toBe(doc.id);
    expect(got.fileName).toBe('mine.pdf');
  });

  it('throws NotFoundError (NOT Forbidden) for a foreign document — existence is not leaked', async () => {
    const { service } = makeService();
    const owner = await seedUser({ username: 'owner' });
    const stranger = await seedUser({ username: 'stranger' });
    const doc = await seedDocument({ userId: owner.id });

    await expect(
      service.getDocumentById(doc.id, ctxFor({ id: stranger.id, username: stranger.username }))
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('lets an ADMIN read any document', async () => {
    const { service } = makeService();
    const owner = await seedUser({ username: 'owner' });
    const doc = await seedDocument({ userId: owner.id, fileName: 'target.pdf' });

    const got = await service.getDocumentById(doc.id, ctxFor({ id: 'admin-1', username: 'root', role: Role.ADMIN }));
    expect(got.fileName).toBe('target.pdf');
  });

  it('throws NotFoundError when the document does not exist', async () => {
    const { service } = makeService();
    await expect(
      service.getDocumentById('cl00000000000000000000000', ctxFor({ id: 'u1', username: 'u' }))
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('getAllDocuments', () => {
  it('returns only the caller documents (scoped to userId)', async () => {
    const { service } = makeService();
    const owner = await seedUser({ username: 'owner' });
    const other = await seedUser({ username: 'other' });
    await seedDocument({ userId: owner.id, fileName: 'a.pdf' });
    await seedDocument({ userId: owner.id, fileName: 'b.pdf' });
    await seedDocument({ userId: other.id, fileName: 'foreign.pdf' });

    const { documents, totalCount } = await service.getAllDocuments(
      ctxFor({ id: owner.id, username: owner.username }),
      1,
      10
    );
    expect(totalCount).toBe(2);
    expect(documents.every((d) => d.userId === owner.id)).toBe(true);
  });

  it('throws UnauthorizedError when there is no userId', async () => {
    const { service } = makeService();
    const ctx = { ...ctxFor({ id: 'x', username: 'x' }), userId: '' };
    await expect(service.getAllDocuments(ctx, 1, 10)).rejects.toBeInstanceOf(UnauthorizedError);
  });
});

describe('updateDocument (Tier-0)', () => {
  const patch = { status: DocumentStatus.COMPLETED, summary: 'done', processingDate: null, processingError: null };

  it('lets the owner update their document', async () => {
    const { service } = makeService();
    const owner = await seedUser({ username: 'owner' });
    const doc = await seedDocument({ userId: owner.id, status: 'PENDING' });

    const updated = await service.updateDocument(doc.id, patch, ctxFor({ id: owner.id, username: owner.username }));
    expect(updated.status).toBe(DocumentStatus.COMPLETED);
    expect(updated.summary).toBe('done');
  });

  it('forbids a USER from updating ANOTHER user document (ForbiddenError)', async () => {
    const { service } = makeService();
    const owner = await seedUser({ username: 'owner' });
    const stranger = await seedUser({ username: 'stranger' });
    const doc = await seedDocument({ userId: owner.id });

    await expect(
      service.updateDocument(doc.id, patch, ctxFor({ id: stranger.id, username: stranger.username }))
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('throws NotFoundError for a missing document', async () => {
    const { service } = makeService();
    await expect(
      service.updateDocument('cl00000000000000000000000', patch, ctxFor({ id: 'u', username: 'u' }))
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('deleteDocument (privacy-critical ordering)', () => {
  it('deletes the Qdrant vectors BEFORE the SQL row, then removes the document', async () => {
    const { service, vector } = makeService();
    const owner = await seedUser({ username: 'owner' });
    const doc = await seedDocument({ userId: owner.id });

    await service.deleteDocument(doc.id, ctxFor({ id: owner.id, username: owner.username }));

    // Vectors purged by the documentId payload filter — so deleted content can't resurface in RAG.
    expect(vector.deletePointsByDocumentId).toHaveBeenCalledWith(doc.id);
    // SQL row is gone.
    expect(await repo.findById(doc.id)).toBeNull();
  });

  it('leaves the SQL row INTACT if the Qdrant delete fails (Qdrant-before-SQL ordering)', async () => {
    const { service, vector } = makeService();
    const owner = await seedUser({ username: 'owner' });
    const doc = await seedDocument({ userId: owner.id });
    vector.deletePointsByDocumentId.mockRejectedValue(new Error('qdrant down'));

    await expect(
      service.deleteDocument(doc.id, ctxFor({ id: owner.id, username: owner.username }))
    ).rejects.toThrow();
    // The document must still exist: we never reach the SQL delete if Qdrant failed.
    expect(await repo.findById(doc.id)).not.toBeNull();
  });

  it('forbids a USER from deleting ANOTHER user document and does NOT touch Qdrant', async () => {
    const { service, vector } = makeService();
    const owner = await seedUser({ username: 'owner' });
    const stranger = await seedUser({ username: 'stranger' });
    const doc = await seedDocument({ userId: owner.id });

    await expect(
      service.deleteDocument(doc.id, ctxFor({ id: stranger.id, username: stranger.username }))
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(vector.deletePointsByDocumentId).not.toHaveBeenCalled();
    expect(await repo.findById(doc.id)).not.toBeNull();
  });

  it('lets an ADMIN delete another user document', async () => {
    const { service, vector } = makeService();
    const owner = await seedUser({ username: 'owner' });
    const doc = await seedDocument({ userId: owner.id });

    await service.deleteDocument(doc.id, ctxFor({ id: 'admin-1', username: 'root', role: Role.ADMIN }));
    expect(vector.deletePointsByDocumentId).toHaveBeenCalledWith(doc.id);
    expect(await repo.findById(doc.id)).toBeNull();
  });

  it('throws NotFoundError for a missing document', async () => {
    const { service } = makeService();
    await expect(
      service.deleteDocument('cl00000000000000000000000', ctxFor({ id: 'u', username: 'u' }))
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('searchDocuments (Tier-0)', () => {
  it('scopes the vector search to the caller userId', async () => {
    const { service, vector, processing } = makeService();
    const owner = await seedUser({ username: 'owner' });
    const doc = await seedDocument({ userId: owner.id });
    // Real payload shape upserted by DocumentProcessingPipeline: the chunk text lives in `textContent`.
    vector.searchVectors.mockResolvedValue([
      { id: 'v1', version: 1, score: 0.9, payload: { documentId: doc.id, textContent: 'chunk ctx' } },
    ]);

    const results = await service.searchDocuments('q', ctxFor({ id: owner.id, username: owner.username }), 5);

    expect(processing.generateEmbedding).toHaveBeenCalledWith('q');
    // Tier-0: the search MUST be hard-scoped to the caller.
    expect(vector.searchVectors).toHaveBeenCalledWith([0.1, 0.2, 0.3], owner.id, 5);
    expect(results).toHaveLength(1);
    expect(results[0].document.id).toBe(doc.id);
    // Guards the payload-field mapping: `textContent` (not `text`) must reach the caller.
    expect(results[0].chunkText).toBe('chunk ctx');
  });

  it('throws UnauthorizedError when there is no userId', async () => {
    const { service } = makeService();
    const ctx = { ...ctxFor({ id: 'x', username: 'x' }), userId: '' };
    await expect(service.searchDocuments('q', ctx, 5)).rejects.toBeInstanceOf(UnauthorizedError);
  });
});
