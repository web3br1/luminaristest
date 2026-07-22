/**
 * Integration tests for StructuredDataService — real SQLite with the real StructuredDataRepository
 * and StructuredDataPolicy (which resolves ownership through the real DocumentRepository). OpenAI is
 * faked (only the pipeline's createFromText uses it; the HTTP-reachable read/update never do).
 *
 * Covers: the owner-only Tier-0 rule (including NO admin bypass — the trait that distinguishes this
 * feature), the typed-error contract (Forbidden vs NotFound vs Unauthorized) and the multi-sheet
 * normalization in the response.
 *
 * Run via `npm run test:integration`.
 */
import { StructuredDataService } from '../StructuredDataService';
import { StructuredDataRepository } from '../../repositories/StructuredDataRepository';
import { StructuredDataPolicy } from '../../policies/StructuredDataPolicy';
import { DocumentRepository } from '../../../documents/repositories/DocumentRepository';
import { Role } from '../../../users/models/User.model';
import { ForbiddenError, NotFoundError, UnauthorizedError } from '@/lib/errors';
import {
  pushTestSchema,
  resetDb,
  disconnectDb,
  seedUser,
  seedDocument,
  seedStructuredData,
  ctxFor,
} from '@test/helpers';

const service = new StructuredDataService(
  new StructuredDataRepository(),
  new StructuredDataPolicy(new DocumentRepository()),
  {} as any // OpenAIService — only used by createFromText (pipeline), not exercised here
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

describe('getByDocumentId (owner-only Tier-0)', () => {
  it('lets the owner read their document structured data (response uses `columns`)', async () => {
    const owner = await seedUser({ username: 'owner' });
    const doc = await seedDocument({ userId: owner.id });
    await seedStructuredData({ documentId: doc.id, headers: [{ name: 'Produto', type: 'TEXT' }], data: [['Notebook', 5000]] });

    const res = await service.getByDocumentId(ctxFor({ id: owner.id, username: owner.username }), doc.id);
    expect(res.columns).toEqual([{ key: 'Produto', title: 'Produto', type: 'TEXT' }]);
    expect(res.data).toEqual([['Notebook', 5000]]);
  });

  it('forbids another USER (ForbiddenError)', async () => {
    const owner = await seedUser({ username: 'owner' });
    const stranger = await seedUser({ username: 'stranger' });
    const doc = await seedDocument({ userId: owner.id });
    await seedStructuredData({ documentId: doc.id });

    await expect(
      service.getByDocumentId(ctxFor({ id: stranger.id, username: stranger.username }), doc.id)
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('forbids an ADMIN who is NOT the owner — no admin bypass (ForbiddenError)', async () => {
    const owner = await seedUser({ username: 'owner' });
    const doc = await seedDocument({ userId: owner.id });
    await seedStructuredData({ documentId: doc.id });

    await expect(
      service.getByDocumentId(ctxFor({ id: 'admin-1', username: 'root', role: Role.ADMIN }), doc.id)
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('throws NotFoundError when the document exists but has no structured data', async () => {
    const owner = await seedUser({ username: 'owner' });
    const doc = await seedDocument({ userId: owner.id }); // no structured data seeded

    await expect(
      service.getByDocumentId(ctxFor({ id: owner.id, username: owner.username }), doc.id)
    ).rejects.toBeInstanceOf(NotFoundError);
  });

  it('forbids access to a non-existent document (canAccess is false → ForbiddenError)', async () => {
    const u = await seedUser({ username: 'u' });
    await expect(
      service.getByDocumentId(ctxFor({ id: u.id, username: u.username }), 'cl00000000000000000000000')
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('throws UnauthorizedError when there is no userId', async () => {
    const ctx = { ...ctxFor({ id: 'x', username: 'x' }), userId: '' };
    await expect(service.getByDocumentId(ctx, 'cl00000000000000000000000')).rejects.toBeInstanceOf(
      UnauthorizedError
    );
  });

  it('normalizes multi-sheet data: exposes `sheets` and uses the first sheet as `data`', async () => {
    const owner = await seedUser({ username: 'owner' });
    const doc = await seedDocument({ userId: owner.id });
    const sheets = [
      { name: 'Jan', headers: [{ key: 'p', title: 'Produto', type: 'TEXT' }], data: [['Notebook', 5000]] },
      { name: 'Feb', headers: [{ key: 'p', title: 'Produto', type: 'TEXT' }], data: [['Mouse', 150]] },
    ];
    await seedStructuredData({ documentId: doc.id, data: sheets });

    const res = await service.getByDocumentId(ctxFor({ id: owner.id, username: owner.username }), doc.id);
    expect(res.sheets).toHaveLength(2);
    expect(res.data).toEqual([['Notebook', 5000]]); // first sheet's data
  });
});

describe('update (owner-only Tier-0)', () => {
  it('lets the owner update their structured data', async () => {
    const owner = await seedUser({ username: 'owner' });
    const doc = await seedDocument({ userId: owner.id });
    await seedStructuredData({ documentId: doc.id, data: [['old', 1]] });

    const res = await service.update(ctxFor({ id: owner.id, username: owner.username }), doc.id, {
      data: [['new', 2]],
    });
    expect(res.data).toEqual([['new', 2]]);
  });

  it('forbids another USER from updating (ForbiddenError)', async () => {
    const owner = await seedUser({ username: 'owner' });
    const stranger = await seedUser({ username: 'stranger' });
    const doc = await seedDocument({ userId: owner.id });
    await seedStructuredData({ documentId: doc.id });

    await expect(
      service.update(ctxFor({ id: stranger.id, username: stranger.username }), doc.id, { data: [['x', 1]] })
    ).rejects.toBeInstanceOf(ForbiddenError);
  });

  it('throws NotFoundError when the document has no structured data to update', async () => {
    const owner = await seedUser({ username: 'owner' });
    const doc = await seedDocument({ userId: owner.id }); // no structured data row

    await expect(
      service.update(ctxFor({ id: owner.id, username: owner.username }), doc.id, { data: [['x', 1]] })
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});
