/**
 * Allowed polymorphic parent types for a CRM attachment.
 * Extensível para 'opportunity' no futuro.
 */
export type AttachmentEntityType = 'lead' | 'account' | 'contact';

/**
 * Core CRM attachment entity within the application domain.
 * Decouples application logic from Prisma. Mirrors the CrmAttachment Prisma model.
 */
export interface IAttachment {
  /** Unique identifier (cuid) */
  id: string;
  /** Owner user id (tenant scope) */
  userId: string;
  /** Polymorphic parent type */
  entityType: string;
  /** Id of the DynamicTable row this file is attached to (not an FK) */
  entityId: string;
  /** Original (sanitized) file name for display */
  fileName: string;
  /** MIME type of the stored binary */
  mimeType: string;
  /** Size of the binary in bytes */
  fileSize: number;
  /** Relative path within ATTACHMENTS_DIR (generated server-side) */
  storageKey: string;
  createdAt: Date;
  updatedAt: Date;
  /** Soft-delete marker; null when active */
  deletedAt: Date | null;
}

/**
 * Input for creating an attachment row. fileName/mimeType/fileSize/storageKey are all
 * derived server-side (from the uploaded file + storage util), never from the client body.
 */
export interface CreateAttachmentInput {
  userId: string;
  entityType: AttachmentEntityType;
  entityId: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  storageKey: string;
}
