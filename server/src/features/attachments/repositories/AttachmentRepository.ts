import prisma from '../../../lib/prisma';
import type { CrmAttachment } from 'generated/prisma';
import type { CreateAttachmentInput } from '../models/Attachment.model';
import type { IAttachmentRepository } from './IAttachmentRepository';

/**
 * Prisma-backed repository for CRM attachments. Only place with prisma.* access.
 * Soft-delete universal — no prisma.delete() anywhere.
 */
export class AttachmentRepository implements IAttachmentRepository {
  public async create(data: CreateAttachmentInput): Promise<CrmAttachment> {
    return prisma.crmAttachment.create({ data });
  }

  public async findById(id: string): Promise<CrmAttachment | null> {
    return prisma.crmAttachment.findFirst({
      where: { id, deletedAt: null },
    });
  }

  public async findManyByEntity(
    userId: string,
    entityType: string,
    entityId: string,
  ): Promise<CrmAttachment[]> {
    return prisma.crmAttachment.findMany({
      where: { userId, entityType, entityId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
  }

  public async softDelete(id: string): Promise<CrmAttachment> {
    return prisma.crmAttachment.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }
}
