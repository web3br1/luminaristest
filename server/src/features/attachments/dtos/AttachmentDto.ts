import { z } from 'zod';

/**
 * Schema for creating a CRM attachment (the JSON/body part of a multipart upload).
 * The file metadata (fileName, mimeType, fileSize, storageKey) is derived server-side
 * from the uploaded file and the storage util — never accepted from the client.
 *
 * @openapi
 * components:
 *   schemas:
 *     CreateAttachment:
 *       type: object
 *       required: [entityType, entityId]
 *       properties:
 *         entityType: { type: string, enum: [lead, account, contact] }
 *         entityId: { type: string, minLength: 1 }
 *     Attachment:
 *       type: object
 *       required: [id, userId, entityType, entityId, fileName, mimeType, fileSize, createdAt]
 *       properties:
 *         id: { type: string, format: cuid }
 *         userId: { type: string }
 *         entityType: { type: string, enum: [lead, account, contact] }
 *         entityId: { type: string }
 *         fileName: { type: string }
 *         mimeType: { type: string }
 *         fileSize: { type: integer }
 *         createdAt: { type: string, format: date-time }
 *         updatedAt: { type: string, format: date-time }
 */
export const CreateAttachmentSchema = z.object({
  entityType: z.enum(['lead', 'account', 'contact']),
  // Restrict to the cuid charset (alphanumerics, underscore, hyphen). This rejects
  // path separators and dot segments, blocking path traversal via entityId (defense in depth).
  entityId: z.string().min(1, 'entityId is required').regex(/^[A-Za-z0-9_-]+$/, 'invalid entityId'),
});

export type CreateAttachmentDto = z.infer<typeof CreateAttachmentSchema>;

/**
 * Type guard for CreateAttachmentDto.
 */
export function isCreateAttachmentDto(obj: unknown): obj is CreateAttachmentDto {
  return CreateAttachmentSchema.safeParse(obj).success;
}
