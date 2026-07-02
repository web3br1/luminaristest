import { z } from 'zod';

// cuid charset (alphanumerics, underscore, hyphen). Rejects path separators and dot
// segments — blocks path traversal via scope/target ids (defense in depth; the storage
// util's assertInsideBase is the primary guard).
const idLike = z.string().min(1).regex(/^[A-Za-z0-9_-]+$/, 'invalid id');

/**
 * Body of a multipart attachment upload. The file metadata (fileName, mimeType,
 * fileSize, sha256, storageKey) is derived server-side — never accepted from the client.
 *
 * @openapi
 * components:
 *   schemas:
 *     UploadDocumentAttachment:
 *       type: object
 *       required: [unitId, targetId]
 *       properties:
 *         unitId: { type: string, minLength: 1 }
 *         targetType: { type: string, enum: [JOURNAL_ENTRY], default: JOURNAL_ENTRY }
 *         targetId: { type: string, minLength: 1, description: journal entry id }
 *         file: { type: string, format: binary }
 *     DocumentAttachment:
 *       type: object
 *       required: [id, targetType, targetId, fileName, mimeType, fileSize, sha256, createdAt]
 *       properties:
 *         id: { type: string, format: cuid }
 *         targetType: { type: string, enum: [JOURNAL_ENTRY] }
 *         targetId: { type: string }
 *         fileName: { type: string }
 *         mimeType: { type: string }
 *         fileSize: { type: integer }
 *         sha256: { type: string, description: 64-char hex checksum }
 *         uploadedById: { type: string, nullable: true }
 *         createdAt: { type: string, format: date-time }
 *         deletedAt: { type: string, format: date-time, nullable: true }
 */
export const UploadDocumentAttachmentSchema = z.object({
  unitId: idLike,
  targetType: z.literal('JOURNAL_ENTRY').default('JOURNAL_ENTRY'),
  targetId: idLike,
});
export type UploadDocumentAttachmentDto = z.infer<typeof UploadDocumentAttachmentSchema>;

/** Query for listing attachments of an entry (unitId is the tenant scope key). */
export const ListDocumentAttachmentsQuerySchema = z.object({
  unitId: idLike,
  targetType: z.literal('JOURNAL_ENTRY').default('JOURNAL_ENTRY'),
});

/** Query for by-id download/delete (scope key only; id comes from the path param). */
export const DocumentAttachmentScopeQuerySchema = z.object({
  unitId: idLike,
});
