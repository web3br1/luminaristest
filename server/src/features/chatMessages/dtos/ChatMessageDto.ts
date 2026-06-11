import { z } from 'zod';
import { ChatMessageRole } from '../models/ChatMessage.model';
import { IChatMessage, IChatMessageSummary } from '../models/ChatMessage.model';

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
 * Schema for creating a new chat message (user-facing endpoint).
 * Only the USER role is accepted — clients cannot forge ASSISTANT or SYSTEM messages.
 * @openapi
 * components:
 *   schemas:
 *     CreateChatMessage:
 *       type: object
 *       required: [content, role, chatInstanceId]
 *       properties:
 *         content: { type: string, minLength: 1, maxLength: 4000 }
 *         role: { type: string, enum: [USER] }
 *         chatInstanceId: { type: string, format: cuid }
 *         documentIds: { type: array, items: { type: string } }
 */
export const CreateChatMessageSchema = z.object({
  content: z.string()
    .min(1, 'chatMessage.validation.contentRequired')
    .max(4000, 'chatMessage.validation.contentTooLong')
    .regex(/^[\s\S]*$/, 'chatMessage.validation.contentInvalidCharacters'),
  role: z.literal(ChatMessageRole.USER, {
    error: 'chatMessage.validation.roleInvalid',
  }),
  chatInstanceId: z.string().cuid({ message: 'chatMessage.validation.chatInstanceIdInvalidCuid' }),
  documentIds: z.array(z.string()).optional(),
});

/**
 * Schema for updating a chat message (user-facing endpoint).
 * The role field is intentionally excluded — clients cannot alter message roles.
 * @openapi
 * components:
 *   schemas:
 *     UpdateChatMessage:
 *       type: object
 *       properties:
 *         content: { type: string, minLength: 1, maxLength: 4000 }
 */
export const UpdateChatMessageSchema = CreateChatMessageSchema.omit({ role: true, chatInstanceId: true, documentIds: true }).partial();

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

// Geralmente não atualizamos mensagens de chat individuais, mas se necessário:
// export const UpdateChatMessageSchema = z.object({
//   content: z.string().min(1, { message: 'chatMessage.validation.contentRequired' }).optional(),
// });
// export type UpdateChatMessageDto = z.infer<typeof UpdateChatMessageSchema>; 