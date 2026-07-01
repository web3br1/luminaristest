/**
 * Target entity types that can carry documentary evidence (BE-INCR-5).
 * Only JOURNAL_ENTRY this increment; broadening (period, reconciliation…) is INCR-6+.
 */
export type DocumentAttachmentTargetType = 'JOURNAL_ENTRY';

/**
 * Core accounting document-attachment entity within the application domain.
 * Decouples business logic from Prisma. Mirrors the DocumentAttachment Prisma model.
 * First-class (NOT CrmAttachment): two-level tenancy (userId + unitId), a real FK to
 * JournalEntry, a sha256 integrity checksum, and audit-in-tx.
 */
export interface IDocumentAttachment {
  /** Unique identifier (cuid). */
  id: string;
  /** Scope owner (AccountingScope.ownerUserId). */
  userId: string;
  /** Business unit (scoped string, not a FK). */
  unitId: string;
  /** Polymorphic-in-intent target type (FK-tied to JournalEntry this increment). */
  targetType: string;
  /** journal_entries.id the evidence is attached to. */
  targetId: string;
  /** Sanitized display name (what is actually on disk). */
  fileName: string;
  mimeType: string;
  fileSize: number;
  /** sha256 hex (64 chars), computed server-side at upload. */
  sha256: string;
  /** Relative path within ATTACHMENTS_DIR (from attachmentStorage.saveFile). */
  storageKey: string;
  /** Actor who uploaded (AccountingScope.actorUserId). */
  uploadedById: string | null;
  /** Actor who soft-deleted; null while active. */
  deletedById: string | null;
  createdAt: Date;
  updatedAt: Date;
  /** Soft-delete marker; null when active. */
  deletedAt: Date | null;
}

/**
 * Input for creating an attachment row. fileName/mimeType/fileSize/sha256/storageKey
 * are all derived server-side (uploaded file + storage util + hash), never from the
 * client body.
 */
export interface CreateDocumentAttachmentInput {
  userId: string;
  unitId: string;
  targetType: DocumentAttachmentTargetType;
  targetId: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
  sha256: string;
  storageKey: string;
  uploadedById: string | null;
}
