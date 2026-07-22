import { z } from 'zod';
import { ChatMessageRole } from '../models/ChatMessage.model';

/**
 * Query schema for listing an instance's messages. Pagination is optional and additive
 * (no page/pageSize → the full conversation); `pageSize` is capped to protect huge threads.
 */
export const ListChatMessagesQuerySchema = z.object({
  instanceId: z.string().cuid({ message: 'Invalid instance ID format' }),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});
export type ListChatMessagesQuery = z.infer<typeof ListChatMessagesQuerySchema>;

/**
 * Schema for chat message response
 * @openapi
 * components:
 *   schemas:
 *     ChatMessage:
 *       type: object
 *       required: [id, content, role, chatInstanceId, createdAt, updatedAt]
 *       properties:
 *         id: { type: string, format: cuid }
 *         content: { type: string, minLength: 1, maxLength: 4000 }
 *         role: { type: string, enum: [user, assistant, system] }
 *         chatInstanceId: { type: string, format: cuid }
 *         createdAt: { type: string, format: date-time }
 *         updatedAt: { type: string, format: date-time }
 */
export const ChatMessageSchema = z.object({
  id: z.string().cuid({ message: 'chatMessage.validation.idInvalidCuid' }),
  content: z.string()
    .min(1, 'chatMessage.validation.contentRequired')
    .max(4000, 'chatMessage.validation.contentTooLong'),
  role: z.nativeEnum(ChatMessageRole, {
    message: 'chatMessage.validation.roleRequired',
  }),
  chatInstanceId: z.string().cuid({ message: 'chatMessage.validation.chatInstanceIdInvalidCuid' }),
  createdAt: z.date(),
  updatedAt: z.date(),
});

/**
 * Schema for creating a new chat message
 * @openapi
 * components:
 *   schemas:
 *     CreateChatMessage:
 *       type: object
 *       required: [content, chatInstanceId]
 *       properties:
 *         content: { type: string, minLength: 1, maxLength: 4000 }
 *         chatInstanceId: { type: string, format: cuid }
 *         documentIds: { type: array, items: { type: string } }
 */
// role is intentionally absent: REST creation always persists a USER message.
// AI (assistant) replies are produced exclusively through the /api/chat endpoint.
export const CreateChatMessageSchema = z.object({
  content: z.string()
    .min(1, 'chatMessage.validation.contentRequired')
    .max(4000, 'chatMessage.validation.contentTooLong'),
  chatInstanceId: z.string().cuid({ message: 'chatMessage.validation.chatInstanceIdInvalidCuid' }),
  documentIds: z.array(z.string()).optional(),
});

/**
 * Schema for updating a chat message
 * @openapi
 * components:
 *   schemas:
 *     UpdateChatMessage:
 *       type: object
 *       properties:
 *         content: { type: string, minLength: 1, maxLength: 4000 }
 *         role: { type: string, enum: [user, assistant, system] }
 */
export const UpdateChatMessageSchema = CreateChatMessageSchema.partial();

/**
 * Schema for chat message summary (used in lists)
 * @openapi
 * components:
 *   schemas:
 *     ChatMessageSummary:
 *       type: object
 *       required: [id, content, role, createdAt]
 *       properties:
 *         id: { type: string, format: cuid }
 *         content: { type: string, minLength: 1, maxLength: 4000 }
 *         role: { type: string, enum: [user, assistant, system] }
 *         createdAt: { type: string, format: date-time }
 */
export const ChatMessageSummarySchema = z.object({
  id: z.string().cuid(),
  content: z.string()
    .min(1, 'chatMessage.validation.contentRequired')
    .max(4000, 'chatMessage.validation.contentTooLong'),
  role: z.nativeEnum(ChatMessageRole),
  createdAt: z.date(),
});

// Types derived from schemas
export type ChatMessageDto = z.infer<typeof ChatMessageSchema>;
export type CreateChatMessageDto = z.infer<typeof CreateChatMessageSchema>;
export type UpdateChatMessageDto = z.infer<typeof UpdateChatMessageSchema>;
export type ChatMessageSummaryDto = z.infer<typeof ChatMessageSummarySchema>;

/**
 * Type guard for ChatMessageDto
 * @param obj - Object to check
 * @returns True if object is a valid ChatMessageDto
 */
export function isChatMessageDto(obj: unknown): obj is ChatMessageDto {
  return ChatMessageSchema.safeParse(obj).success;
}

/**
 * Type guard for CreateChatMessageDto
 * @param obj - Object to check
 * @returns True if object is a valid CreateChatMessageDto
 */
export function isCreateChatMessageDto(obj: unknown): obj is CreateChatMessageDto {
  return CreateChatMessageSchema.safeParse(obj).success;
}

/**
 * Type guard for UpdateChatMessageDto
 * @param obj - Object to check
 * @returns True if object is a valid UpdateChatMessageDto
 */
export function isUpdateChatMessageDto(obj: unknown): obj is UpdateChatMessageDto {
  return UpdateChatMessageSchema.safeParse(obj).success;
}

/**
 * Type guard for ChatMessageSummaryDto
 * @param obj - Object to check
 * @returns True if object is a valid ChatMessageSummaryDto
 */
export function isChatMessageSummaryDto(obj: unknown): obj is ChatMessageSummaryDto {
  return ChatMessageSummarySchema.safeParse(obj).success;
} 