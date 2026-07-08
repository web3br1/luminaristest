/**
 * Integration test: formal provenance (source_documents, journal_entry_sources) against a
 * REAL SQLite database — BE-INCR-8 / ADR-INCR8. No mocks. Proves the SCHEMA-LEVEL guarantees
 * that a mocked unit test cannot: no-cascade on User delete (D7/ACC-020), plain-scope-string
 * tenancy (no User FK), the drill-down include (entry → SourceDocument → attachment), and
 * cross-unit read isolation.
 *
 * Mirrors the dedicated-client pattern of PostingRepository.concurrency.test.ts. FK enforcement
 * is turned ON explicitly so the cascade/no-cascade behavior is real.
 */
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { execSync } from 'child_process';
import { PrismaClient } from 'generated/prisma';

const SERVER_ROOT = path.join(__dirname, '../../../../../');

describe('SourceDocument / JournalEntrySource — real SQLite DB (BE-INCR-8)', () => {
  let db: PrismaClient;
  let dbPath: string;

  const scope = { userId: 'u-prov', unitId: 'unit-prov' };

  beforeAll(async () => {
    dbPath = path.join(os.tmpdir(), `incr8-prov-${Date.now()}.db`);
    execSync('npx prisma migrate deploy', {
      cwd: SERVER_ROOT,
      env: { ...process.env, DATABASE_URL: `file:${dbPath}` },
      stdio: 'pipe',
    });
    db = new PrismaClient({
      datasources: { db: { url: `file:${dbPath}?connection_limit=1` } },
    });
    await db.$connect();
    await db.$queryRawUnsafe('PRAGMA foreign_keys = ON');

    await db.user.create({
      data: { id: 'u-prov', name: 'Prov User', username: 'provuser', email: 'prov@test.local', password: 'x', role: 'USER' },
    });
  }, 60000);

  afterAll(async () => {
    await db.$disconnect();
    for (const suffix of ['', '-wal', '-shm']) {
      try { fs.unlinkSync(dbPath + suffix); } catch {}
    }
  });

  it('no-cascade: deleting the User leaves the SourceDocument intact (D7/ACC-020 — origin is evidence)', async () => {
    // A standalone origin scoped to a user that we are about to delete.
    const doomedUserId = 'u-doomed';
    await db.user.create({
      data: { id: doomedUserId, name: 'Doomed', username: 'doomed', email: 'doomed@test.local', password: 'x', role: 'USER' },
    });
    const sd = await db.sourceDocument.create({
      data: { userId: doomedUserId, unitId: 'unit-prov', sourceType: 'crm.opportunity.won', externalRef: 'REF-KEEP' },
    });

    await db.user.delete({ where: { id: doomedUserId } });

    const survivor = await db.sourceDocument.findUnique({ where: { id: sd.id } });
    expect(survivor).not.toBeNull();
    expect(survivor?.externalRef).toBe('REF-KEEP');
  });

  it('plain scope strings: SourceDocument/JournalEntrySource accept a userId with no matching User (no User FK)', async () => {
    // If there were a User FK, this would throw P2003. It does not — userId is a plain scope key.
    const sd = await db.sourceDocument.create({
      data: { userId: 'ghost-user', unitId: 'unit-prov', sourceType: 'IMPORT_JOURNAL_ENTRIES' },
    });
    expect(sd.userId).toBe('ghost-user');

    const entry = await createEntry(db, 'entry-ghost');
    const link = await db.journalEntrySource.create({
      data: { userId: 'ghost-user', unitId: 'unit-prov', journalEntryId: entry.id, sourceDocumentId: sd.id },
    });
    expect(link.userId).toBe('ghost-user');
  });

  it('drill-down: findSourcesByEntry-shaped read resolves entry → SourceDocument → attachment, scoped', async () => {
    const entry = await createEntry(db, 'entry-drill');
    const sd = await db.sourceDocument.create({
      data: {
        userId: scope.userId, unitId: scope.unitId, sourceType: 'salon.sale.finalized',
        externalRef: 'NF-DRILL', description: 'Venda', attachmentId: 'att-drill',
      },
    });
    await db.journalEntrySource.create({
      data: { userId: scope.userId, unitId: scope.unitId, journalEntryId: entry.id, sourceDocumentId: sd.id },
    });

    // Same query SourceProvenanceRepository.findSourcesByEntry issues.
    const rows = await db.journalEntrySource.findMany({
      where: { journalEntryId: entry.id, userId: scope.userId, unitId: scope.unitId },
      include: { sourceDocument: true },
      orderBy: { createdAt: 'asc' },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].sourceDocument.externalRef).toBe('NF-DRILL');
    expect(rows[0].sourceDocument.attachmentId).toBe('att-drill');

    // Cross-unit read is isolated — another unit sees nothing.
    const crossUnit = await db.journalEntrySource.findMany({
      where: { journalEntryId: entry.id, userId: scope.userId, unitId: 'unit-OTHER' },
      include: { sourceDocument: true },
    });
    expect(crossUnit).toHaveLength(0);
  });

  it('link @@unique([journalEntryId, sourceDocumentId]): re-linking the same pair does not duplicate', async () => {
    const entry = await createEntry(db, 'entry-uniq');
    const sd = await db.sourceDocument.create({
      data: { userId: scope.userId, unitId: scope.unitId, sourceType: 'manual', externalRef: 'REF-UNIQ' },
    });
    await db.journalEntrySource.create({
      data: { userId: scope.userId, unitId: scope.unitId, journalEntryId: entry.id, sourceDocumentId: sd.id },
    });
    await expect(
      db.journalEntrySource.create({
        data: { userId: scope.userId, unitId: scope.unitId, journalEntryId: entry.id, sourceDocumentId: sd.id },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });
});

/** Minimal Posted JournalEntry directly via prisma (bypasses the service) for FK-satisfying links. */
let entryCounter = 0;
async function createEntry(db: PrismaClient, id: string) {
  return db.journalEntry.create({
    data: {
      id,
      userId: 'u-prov',
      unitId: 'unit-prov',
      date: new Date('2026-06-23'),
      description: 'entry for provenance test',
      status: 'Posted',
      sourceType: 'manual',
      fiscalYear: 2026,
      entryNumber: ++entryCounter, // unique within (userId,unitId,fiscalYear)
    },
  });
}
