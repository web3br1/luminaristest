import prisma from '../../../lib/prisma';
import type { DocumentAttachment, Prisma } from 'generated/prisma';
import { NotFoundError } from '../../../lib/errors';
import type { AccountingScope } from '../scope/AccountingScope';
import { accountingScopeWhere } from '../scope/AccountingScope';
import type { IDocumentAttachmentRepository } from './IDocumentAttachmentRepository';
import type {
  CreateDocumentAttachmentInput,
  DocumentAttachmentTargetType,
} from '../models/DocumentAttachment.model';

/**
 * Prisma-backed repository for accounting document attachments (`document_attachments`).
 * Only place with prisma.documentAttachment.* access. Two-level tenancy via
 * AccountingScope; soft-delete universal (no prisma.delete()).
 */
export class DocumentAttachmentRepository implements IDocumentAttachmentRepository {
  public async create(
    data: CreateDocumentAttachmentInput,
    tx?: Prisma.TransactionClient,
  ): Promise<DocumentAttachment> {
    return (tx ?? prisma).documentAttachment.create({
      data: {
        userId: data.userId,
        unitId: data.unitId,
        targetType: data.targetType,
        targetId: data.targetId,
        fileName: data.fileName,
        mimeType: data.mimeType,
        fileSize: data.fileSize,
        sha256: data.sha256,
        storageKey: data.storageKey,
        uploadedById: data.uploadedById,
      },
    });
  }

  public async findById(
    scope: AccountingScope,
    id: string,
    tx?: Prisma.TransactionClient,
  ): Promise<DocumentAttachment | null> {
    return (tx ?? prisma).documentAttachment.findFirst({
      where: { id, ...accountingScopeWhere(scope), deletedAt: null },
    });
  }

  public async findManyByTarget(
    scope: AccountingScope,
    targetType: DocumentAttachmentTargetType,
    targetId: string,
    tx?: Prisma.TransactionClient,
  ): Promise<DocumentAttachment[]> {
    return (tx ?? prisma).documentAttachment.findMany({
      where: { ...accountingScopeWhere(scope), targetType, targetId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  }

  public async softDelete(
    scope: AccountingScope,
    id: string,
    deletedById: string,
    tx?: Prisma.TransactionClient,
  ): Promise<void> {
    // updateMany so the WHERE can carry userId+unitId (update() rejects non-unique filters).
    // A 0-row result means the id is not this tenant's active row — fail loud, never no-op.
    const { count } = await (tx ?? prisma).documentAttachment.updateMany({
      where: { id, ...accountingScopeWhere(scope), deletedAt: null },
      data: { deletedAt: new Date(), deletedById },
    });
    if (count === 0) {
      throw new NotFoundError(`Anexo '${id}' não encontrado para exclusão.`);
    }
  }

  public async runTransaction<T>(
    fn: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    return prisma.$transaction(fn);
  }
}
