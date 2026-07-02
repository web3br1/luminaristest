import { DocumentAttachmentService } from '../DocumentAttachmentService';
import { ForbiddenError, NotFoundError } from '../../../../lib/errors';
import { canonicalizeAuditPayload } from '../../audit/auditCanonical';
import type { AccountingScope } from '../../scope/AccountingScope';
import type { IDocumentAttachmentRepository } from '../../repositories/IDocumentAttachmentRepository';
import type { IJournalEntryRepository } from '../../repositories/IJournalEntryRepository';
import type { IAccountingPolicy } from '../../policies/IAccountingPolicy';
import type { AuditService } from '../AuditService';
import type { DocumentAttachment, Prisma } from 'generated/prisma';
import * as storage from '../../../../lib/attachmentStorage';

// Mock the disk store so tests never touch the filesystem.
jest.mock('../../../../lib/attachmentStorage');
const mockedStorage = storage as jest.Mocked<typeof storage>;

const scope: AccountingScope = {
  ownerUserId: 'u1',
  actorUserId: 'u1',
  unitId: 'unit-1',
  ledgerCode: 'DEFAULT',
  baseCurrencyCode: 'BRL',
  timeZone: 'America/Sao_Paulo',
};

function makeRow(over: Partial<DocumentAttachment> = {}): DocumentAttachment {
  return {
    id: 'att-1',
    userId: 'u1',
    unitId: 'unit-1',
    targetType: 'JOURNAL_ENTRY',
    targetId: 'entry-1',
    fileName: 'nota.pdf',
    mimeType: 'application/pdf',
    fileSize: 1234,
    sha256: 'a'.repeat(64),
    storageKey: 'u1/unit-1/entry-1/abcd1234_nota.pdf',
    uploadedById: 'u1',
    deletedById: null,
    createdAt: new Date('2026-06-30T00:00:00Z'),
    updatedAt: new Date('2026-06-30T00:00:00Z'),
    deletedAt: null,
    ...over,
  };
}

function buildService(
  overrides: {
    repo?: Partial<IDocumentAttachmentRepository>;
    policy?: Partial<IAccountingPolicy>;
    entryFound?: boolean;
  } = {},
) {
  const runTransaction = jest.fn(async (fn: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
    fn({} as Prisma.TransactionClient),
  );
  const repository = {
    // Echo the input like a real create (so sha256/fileName flow back into the row).
    create: jest.fn(async (data: Partial<DocumentAttachment>) => makeRow(data)),
    findById: jest.fn(async () => makeRow()),
    findManyByTarget: jest.fn(async () => [makeRow()]),
    softDelete: jest.fn(async () => undefined),
    runTransaction,
    ...overrides.repo,
  } as unknown as jest.Mocked<IDocumentAttachmentRepository>;

  const policy = {
    canManage: jest.fn(() => true),
    canRead: jest.fn(() => true),
    canPost: jest.fn(() => true),
    canClosePeriod: jest.fn(() => true),
    ...overrides.policy,
  } as unknown as jest.Mocked<IAccountingPolicy>;

  const append = jest.fn() as jest.MockedFunction<AuditService['append']>;
  append.mockResolvedValue(undefined);
  const audit = { append } as unknown as AuditService;

  const journalEntryRepo = {
    findById: jest.fn(async () => (overrides.entryFound === false ? null : makeRow())),
  } as unknown as jest.Mocked<IJournalEntryRepository>;

  const svc = new DocumentAttachmentService(repository, policy, audit, journalEntryRepo);
  return { svc, repository, policy, append, journalEntryRepo };
}

describe('DocumentAttachmentService', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('upload', () => {
    it('hashes the file, persists the sanitized name + sha256, and returns a client-safe response', async () => {
      mockedStorage.saveFile.mockResolvedValue({
        storageKey: 'u1/unit-1/entry-1/abcd1234_nota.pdf',
        sanitizedName: 'nota.pdf',
      });
      const { svc, repository, append } = buildService();

      const buffer = Buffer.from('%PDF-1.4 conteudo');
      const result = await svc.upload(scope, {
        targetType: 'JOURNAL_ENTRY',
        targetId: 'entry-1',
        fileName: 'nota fiscal.pdf',
        mimeType: 'application/pdf',
        buffer,
      });

      // Storage segments give tenant isolation on disk: userId/unitId/targetId.
      expect(mockedStorage.saveFile).toHaveBeenCalledWith(
        'u1',
        'unit-1',
        'entry-1',
        'nota fiscal.pdf',
        buffer,
      );
      // sha256 is computed server-side over the actual bytes (real 64-char hex, not a
      // placeholder) and the SAME hash flows to create, audit, and the response.
      const createArg = repository.create.mock.calls[0][0];
      const { createHash } = require('node:crypto') as typeof import('node:crypto');
      const expected = createHash('sha256').update(buffer).digest('hex');
      expect(createArg.sha256).toBe(expected);
      expect(createArg.fileName).toBe('nota.pdf'); // sanitized, not raw client input
      expect(createArg.uploadedById).toBe('u1');
      // Audit emitted in-tx with the created id + PII-safe payload.
      expect(append).toHaveBeenCalledTimes(1);
      const auditArg = append.mock.calls[0][2];
      expect(auditArg.eventType).toBe('attachment.uploaded');
      expect(auditArg.payload).toEqual({
        journalEntryId: 'entry-1',
        mimeType: 'application/pdf',
        sizeBytes: String(buffer.length),
        sha256: expected,
      });
      // Response is client-safe.
      expect(result).not.toHaveProperty('storageKey');
      expect(result).not.toHaveProperty('userId');
      expect(result).not.toHaveProperty('unitId');
      expect(result.sha256).toBe(expected);
    });

    it('rejects a target entry outside the scope as NotFound WITHOUT writing a file', async () => {
      const { svc } = buildService({ entryFound: false });
      await expect(
        svc.upload(scope, {
          targetType: 'JOURNAL_ENTRY',
          targetId: 'entry-x',
          fileName: 'x.pdf',
          mimeType: 'application/pdf',
          buffer: Buffer.from('x'),
        }),
      ).rejects.toBeInstanceOf(NotFoundError);
      expect(mockedStorage.saveFile).not.toHaveBeenCalled();
    });

    it('TX-001 compensation: deletes the orphan file if the DB tx fails after the write', async () => {
      mockedStorage.saveFile.mockResolvedValue({
        storageKey: 'u1/unit-1/entry-1/abcd1234_nota.pdf',
        sanitizedName: 'nota.pdf',
      });
      mockedStorage.deleteFile.mockResolvedValue(undefined);
      const { svc } = buildService({
        repo: { runTransaction: jest.fn(async () => { throw new Error('db down'); }) },
      });

      await expect(
        svc.upload(scope, {
          targetType: 'JOURNAL_ENTRY',
          targetId: 'entry-1',
          fileName: 'nota.pdf',
          mimeType: 'application/pdf',
          buffer: Buffer.from('x'),
        }),
      ).rejects.toThrow('db down');
      expect(mockedStorage.deleteFile).toHaveBeenCalledWith('u1/unit-1/entry-1/abcd1234_nota.pdf');
    });

    it('throws ForbiddenError when the actor cannot manage', async () => {
      const { svc } = buildService({ policy: { canManage: jest.fn(() => false) } });
      await expect(
        svc.upload(scope, {
          targetType: 'JOURNAL_ENTRY',
          targetId: 'entry-1',
          fileName: 'x.pdf',
          mimeType: 'application/pdf',
          buffer: Buffer.from('x'),
        }),
      ).rejects.toBeInstanceOf(ForbiddenError);
    });
  });

  describe('delete', () => {
    it('soft-deletes + audits in-tx and RETAINS the binary on disk (compliance)', async () => {
      const { svc, repository, append } = buildService();
      await svc.delete(scope, 'att-1');

      expect(repository.softDelete).toHaveBeenCalledWith(scope, 'att-1', 'u1', expect.anything());
      const auditArg = append.mock.calls[0][2];
      expect(auditArg.eventType).toBe('attachment.deleted');
      expect(auditArg.payload).toMatchObject({ deletedById: 'u1', journalEntryId: 'entry-1' });
      // The physical file is NOT removed on delete (unlike CRM AttachmentService).
      expect(mockedStorage.deleteFile).not.toHaveBeenCalled();
    });

    it('throws NotFoundError on cross-tenant / already-deleted (idempotent) delete', async () => {
      const { svc, repository, append } = buildService({
        repo: { findById: jest.fn(async () => null) },
      });
      await expect(svc.delete(scope, 'att-1')).rejects.toBeInstanceOf(NotFoundError);
      expect(repository.softDelete).not.toHaveBeenCalled();
      expect(append).not.toHaveBeenCalled();
    });
  });

  describe('getForDownload', () => {
    const original = process.env.AUDIT_DOWNLOAD_ATTACHMENTS;
    afterEach(() => { process.env.AUDIT_DOWNLOAD_ATTACHMENTS = original; });

    it('returns meta + resolved path and does NOT audit when the flag is off', async () => {
      delete process.env.AUDIT_DOWNLOAD_ATTACHMENTS;
      mockedStorage.resolveReadPath.mockReturnValue('/abs/u1/unit-1/entry-1/abcd1234_nota.pdf');
      const { svc, append } = buildService();

      const result = await svc.getForDownload(scope, 'att-1');

      expect(result.meta.id).toBe('att-1');
      expect(result.absPath).toBe('/abs/u1/unit-1/entry-1/abcd1234_nota.pdf');
      expect(append).not.toHaveBeenCalled();
    });

    it('emits attachment.downloaded when the flag is on', async () => {
      process.env.AUDIT_DOWNLOAD_ATTACHMENTS = 'true';
      mockedStorage.resolveReadPath.mockReturnValue('/abs/x');
      const { svc, append } = buildService();

      await svc.getForDownload(scope, 'att-1');

      expect(append).toHaveBeenCalledTimes(1);
      expect(append.mock.calls[0][2].eventType).toBe('attachment.downloaded');
    });

    it('throws NotFoundError for a missing / cross-tenant attachment', async () => {
      const { svc } = buildService({ repo: { findById: jest.fn(async () => null) } });
      await expect(svc.getForDownload(scope, 'nope')).rejects.toBeInstanceOf(NotFoundError);
      expect(mockedStorage.resolveReadPath).not.toHaveBeenCalled();
    });
  });

  describe('listByTarget', () => {
    it('scopes to (scope, targetType, targetId) and returns client-safe rows', async () => {
      const { svc, repository } = buildService();
      const rows = await svc.listByTarget(scope, 'JOURNAL_ENTRY', 'entry-1');

      expect(repository.findManyByTarget).toHaveBeenCalledWith(scope, 'JOURNAL_ENTRY', 'entry-1');
      expect(rows).toHaveLength(1);
      expect(rows[0]).not.toHaveProperty('storageKey');
      expect(rows[0]).not.toHaveProperty('userId');
    });

    it('throws ForbiddenError when the actor cannot read', async () => {
      const { svc } = buildService({ policy: { canRead: jest.fn(() => false) } });
      await expect(svc.listByTarget(scope, 'JOURNAL_ENTRY', 'entry-1')).rejects.toBeInstanceOf(
        ForbiddenError,
      );
    });
  });
});

// Phase 4 — the attachment eventTypes are allowlisted and drop non-allowlisted keys.
describe('auditCanonical — attachment events', () => {
  it('keeps only allowlisted keys and stringifies deterministically', () => {
    const json = canonicalizeAuditPayload('attachment.uploaded', {
      journalEntryId: 'entry-1',
      mimeType: 'application/pdf',
      sizeBytes: '1234',
      sha256: 'a'.repeat(64),
      // forbidden — must be dropped:
      storageKey: 'u1/unit-1/entry-1/secret.pdf',
      fileName: 'salario.pdf',
      token: 'xyz',
    });
    const parsed = JSON.parse(json);
    expect(Object.keys(parsed).sort()).toEqual(['journalEntryId', 'mimeType', 'sha256', 'sizeBytes']);
    expect(parsed.storageKey).toBeUndefined();
    expect(parsed.fileName).toBeUndefined();
  });

  it('throws on an unknown attachment eventType', () => {
    expect(() => canonicalizeAuditPayload('attachment.frobnicated', {})).toThrow(/unknown eventType/i);
  });
});

// Exercise the REAL storage util (no mock) — proves the shared path-traversal guard
// rejects a malicious targetId on the WRITE path for accounting segments too.
describe('attachmentStorage (real) path-traversal guard', () => {
  const realStorage = jest.requireActual<typeof import('../../../../lib/attachmentStorage')>(
    '../../../../lib/attachmentStorage',
  );

  it('rejects saveFile when a segment escapes the base dir via ".."', async () => {
    await expect(
      realStorage.saveFile('u1', 'unit-1', '../../../../../../Windows/Temp', 'evil.pdf', Buffer.from('x')),
    ).rejects.toThrow(/path traversal/i);
  });
});
