import { AttachmentService } from '../AttachmentService';
import { NotFoundError } from '../../../../lib/errors';
import type { IAttachmentRepository } from '../../repositories/IAttachmentRepository';
import type { IAttachmentPolicy } from '../../policies/IAttachmentPolicy';
import type { IUser } from '../../../users/models/User.model';
import { Role } from '../../../users/models/User.model';
import * as storage from '../../../../lib/attachmentStorage';

// Mock the disk store so tests never touch the filesystem.
jest.mock('../../../../lib/attachmentStorage');
const mockedStorage = storage as jest.Mocked<typeof storage>;

const actor: IUser = {
  id: 'u1',
  name: 'User One',
  username: 'user1',
  email: 'u1@example.com',
  role: Role.USER,
  createdAt: new Date('2026-01-01T00:00:00Z'),
  updatedAt: new Date('2026-01-01T00:00:00Z'),
};

function makeAttachment(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'att-1',
    userId: 'u1',
    entityType: 'lead',
    entityId: 'lead-1',
    fileName: 'doc.pdf',
    mimeType: 'application/pdf',
    fileSize: 1234,
    storageKey: 'u1/lead/lead-1/abcd1234_doc.pdf',
    createdAt: new Date('2026-01-02T00:00:00Z'),
    updatedAt: new Date('2026-01-02T00:00:00Z'),
    deletedAt: null,
    ...over,
  };
}

function buildService(
  overrides: { repo?: Partial<IAttachmentRepository>; policy?: Partial<IAttachmentPolicy> } = {},
) {
  const repository = {
    create: jest.fn(async () => makeAttachment()),
    findById: jest.fn(async () => makeAttachment()),
    findManyByEntity: jest.fn(async () => [makeAttachment()]),
    softDelete: jest.fn(async () => makeAttachment({ deletedAt: new Date() })),
    ...overrides.repo,
  } as jest.Mocked<IAttachmentRepository>;

  const policy = {
    canView: jest.fn(() => true),
    canDelete: jest.fn(() => true),
    ...overrides.policy,
  } as jest.Mocked<IAttachmentPolicy>;

  const svc = new AttachmentService(repository, policy);
  return { svc, repository, policy };
}

describe('AttachmentService', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('upload', () => {
    it('persists the SANITIZED name and returns a client-safe response without storageKey/userId', async () => {
      // saveFile sanitizes "evil name.pdf" -> "evil_name.pdf"; the row must store the sanitized value.
      mockedStorage.saveFile.mockResolvedValue({
        storageKey: 'u1/lead/lead-1/abcd1234_evil_name.pdf',
        sanitizedName: 'evil_name.pdf',
      });
      const { svc, repository } = buildService({
        repo: {
          create: jest.fn(async () =>
            makeAttachment({
              fileName: 'evil_name.pdf',
              storageKey: 'u1/lead/lead-1/abcd1234_evil_name.pdf',
            }),
          ),
        },
      });

      const buffer = Buffer.from('%PDF-1.4 fake');
      const result = await svc.upload(actor, {
        entityType: 'lead',
        entityId: 'lead-1',
        fileName: 'evil name.pdf',
        mimeType: 'application/pdf',
        buffer,
      });

      expect(mockedStorage.saveFile).toHaveBeenCalledWith(
        'u1',
        'lead',
        'lead-1',
        'evil name.pdf',
        buffer,
      );
      // Row persists the sanitized name, not the raw client input.
      expect(repository.create).toHaveBeenCalledWith({
        userId: 'u1',
        entityType: 'lead',
        entityId: 'lead-1',
        fileName: 'evil_name.pdf',
        mimeType: 'application/pdf',
        fileSize: buffer.length,
        storageKey: 'u1/lead/lead-1/abcd1234_evil_name.pdf',
      });
      // Response is client-safe: no storageKey, no userId.
      expect(result).not.toHaveProperty('storageKey');
      expect(result).not.toHaveProperty('userId');
      expect(result.fileName).toBe('evil_name.pdf');
    });
  });

  describe('getForDownload', () => {
    it('returns meta + resolved path for an owned attachment', async () => {
      mockedStorage.resolveReadPath.mockReturnValue('/abs/u1/lead/lead-1/abcd1234_doc.pdf');
      const { svc } = buildService();

      const result = await svc.getForDownload(actor, 'att-1');

      expect(result.meta.id).toBe('att-1');
      expect(result.absPath).toBe('/abs/u1/lead/lead-1/abcd1234_doc.pdf');
    });

    it('throws NotFoundError when the attachment belongs to another tenant', async () => {
      const { svc, repository } = buildService({
        repo: { findById: jest.fn(async () => makeAttachment({ userId: 'someone-else' })) },
      });

      await expect(svc.getForDownload(actor, 'att-1')).rejects.toBeInstanceOf(NotFoundError);
      expect(repository.findById).toHaveBeenCalledWith('att-1');
      expect(mockedStorage.resolveReadPath).not.toHaveBeenCalled();
    });
  });

  describe('delete', () => {
    it('soft-deletes the row and best-effort removes the binary', async () => {
      mockedStorage.deleteFile.mockResolvedValue(undefined);
      const { svc, repository } = buildService();

      await svc.delete(actor, 'att-1');

      expect(repository.softDelete).toHaveBeenCalledWith('att-1');
      expect(mockedStorage.deleteFile).toHaveBeenCalledWith('u1/lead/lead-1/abcd1234_doc.pdf');
    });

    it('throws NotFoundError on cross-tenant delete', async () => {
      const { svc, repository } = buildService({
        repo: { findById: jest.fn(async () => makeAttachment({ userId: 'someone-else' })) },
      });

      await expect(svc.delete(actor, 'att-1')).rejects.toBeInstanceOf(NotFoundError);
      expect(repository.softDelete).not.toHaveBeenCalled();
      expect(mockedStorage.deleteFile).not.toHaveBeenCalled();
    });
  });

  describe('listByEntity', () => {
    it('scopes the query to the actor id and returns client-safe rows (no storageKey/userId)', async () => {
      const { svc, repository } = buildService();

      const rows = await svc.listByEntity(actor, 'lead', 'lead-1');

      expect(repository.findManyByEntity).toHaveBeenCalledWith('u1', 'lead', 'lead-1');
      expect(rows).toHaveLength(1);
      expect(rows[0]).not.toHaveProperty('storageKey');
      expect(rows[0]).not.toHaveProperty('userId');
      expect(rows[0].id).toBe('att-1');
    });
  });
});

// Exercise the REAL storage util (no mock) to prove the path-traversal guard rejects
// a malicious entityId on the WRITE path.
describe('attachmentStorage (real) path-traversal guard', () => {
  const realStorage = jest.requireActual<typeof import('../../../../lib/attachmentStorage')>(
    '../../../../lib/attachmentStorage',
  );

  it('rejects saveFile when entityId escapes the base dir via ".."', async () => {
    await expect(
      realStorage.saveFile(
        'u1',
        'lead',
        '../../../../../../Windows/Temp',
        'evil.pdf',
        Buffer.from('x'),
      ),
    ).rejects.toThrow(/path traversal/i);
  });

  it('rejects resolveReadPath for a key that escapes the base dir', () => {
    expect(() => realStorage.resolveReadPath('../../etc/passwd')).toThrow(/path traversal/i);
  });
});
