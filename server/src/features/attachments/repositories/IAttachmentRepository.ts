import type { CrmAttachment } from 'generated/prisma';
import type { CreateAttachmentInput } from '../models/Attachment.model';

/**
 * Contract for CRM attachment data access. Soft-delete universal: reads filter
 * deletedAt: null and delete is an update of deletedAt (never prisma.delete()).
 */
export interface IAttachmentRepository {
  /** Persists a new attachment metadata row. */
  create(data: CreateAttachmentInput): Promise<CrmAttachment>;

  /** Finds an active (non-deleted) attachment by id, or null. */
  findById(id: string): Promise<CrmAttachment | null>;

  /**
   * Lists active attachments for a given parent record, scoped to the owner.
   * Ordered by createdAt desc.
   */
  findManyByEntity(
    userId: string,
    entityType: string,
    entityId: string,
  ): Promise<CrmAttachment[]>;

  /** Soft-deletes an attachment (sets deletedAt). */
  softDelete(id: string): Promise<CrmAttachment>;
}
