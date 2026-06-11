import { z } from 'zod';
import { IChatInstance, IChatInstanceSummary } from '../models/ChatInstance.model';
import { ChatInstanceType } from 'generated/prisma';
// import { ChatMessageDtoSchema } from './ChatMessageDto'; // This import will need to be adjusted after ChatMessageDto is moved/confirmed

/**
 * Base schema for ChatInstance
 * @openapi
 * components:
 *   schemas:
 *     ChatInstance:
 *       type: object
 *       required: [id, widgetInstanceId, userId, createdAt, updatedAt]
 *       properties:
 *         id: { type: string, format: cuid }
 *         widgetInstanceId: { type: string }
 *         title: { type: string, nullable: true }
 *         userId: { type: string, format: cuid }
 *         createdAt: { type: string, format: date-time }
 *         updatedAt: { type: string, format: date-time }
 */
export const ChatInstanceSchema = z.object({
  id: z.string().cuid(),
  title: z.string().nullable(),
  description: z.string().nullable().optional(),
  type: z.enum(['DOCUMENT', 'GENERIC']).default('DOCUMENT'),
  widgetInstanceId: z.string(),
  userId: z.string().cuid(),
  createdAt: z.date(),
  updatedAt: z.date()
});

/**
 * Schema for creating a new chat instance
 * @openapi
 * components:
 *   schemas:
 *     CreateChatInstance:
 *       type: object
 *       required: [widgetInstanceId]
 *       properties:
 *         widgetInstanceId: { type: string }
 *         title: { type: string, nullable: true }
 */
export const CreateChatInstanceSchema = z.object({
  title: z.string().nullable(),
  description: z.string().nullable().optional(),
  type: z.enum(['DOCUMENT', 'GENERIC']).default('DOCUMENT'),
  widgetInstanceId: z.string()
});

/**
 * Schema for updating a chat instance title
 * @openapi
 * components:
 *   schemas:
 *     UpdateChatInstanceTitle:
 *       type: object
 *       required: [title]
 *       properties:
 *         title: { type: string, minLength: 1, maxLength: 100 }
 */
export const UpdateChatInstanceSchema = CreateChatInstanceSchema.partial();

/**
 * Schema for chat instance summary (used in lists)
 * @openapi
 * components:
 *   schemas:
 *     ChatInstanceSummary:
 *       type: object
 *       required: [id, widgetInstanceId, createdAt, updatedAt]
 *       properties:
 *         id: { type: string, format: cuid }
 *         title: { type: string, nullable: true }
 *         widgetInstanceId: { type: string }
 *         createdAt: { type: string, format: date-time }
 *         updatedAt: { type: string, format: date-time }
 */
export const ChatInstanceSummarySchema = z.object({
  id: z.string().cuid(),
  title: z.string().nullable(),
  type: z.enum(['DOCUMENT', 'GENERIC']).default('DOCUMENT'),
  widgetInstanceId: z.string(),
  createdAt: z.date(),
  updatedAt: z.date(),
});

// Types derived from schemas
export type ChatInstanceDto = z.infer<typeof ChatInstanceSchema>;
export type CreateChatInstanceDto = z.infer<typeof CreateChatInstanceSchema>;
export type UpdateChatInstanceDto = z.infer<typeof UpdateChatInstanceSchema>;
export type ChatInstanceSummaryDto = z.infer<typeof ChatInstanceSummarySchema>;

/**
 * Type guard for ChatInstanceDto
 * @param obj - Object to check
 * @returns True if object is a valid ChatInstanceDto
 */
export function isChatInstanceDto(obj: unknown): obj is ChatInstanceDto {
  return ChatInstanceSchema.safeParse(obj).success;
}

/**
 * Type guard for CreateChatInstanceDto
 * @param obj - Object to check
 * @returns True if object is a valid CreateChatInstanceDto
 */
export function isCreateChatInstanceDto(obj: unknown): obj is CreateChatInstanceDto {
  return CreateChatInstanceSchema.safeParse(obj).success;
}

/**
 * Type guard for UpdateChatInstanceDto
 * @param obj - Object to check
 * @returns True if object is a valid UpdateChatInstanceDto
 */
export function isUpdateChatInstanceDto(obj: unknown): obj is UpdateChatInstanceDto {
  return UpdateChatInstanceSchema.safeParse(obj).success;
}

/**
 * Type guard for ChatInstanceSummaryDto
 * @param obj - Object to check
 * @returns True if object is a valid ChatInstanceSummaryDto
 */
export function isChatInstanceSummaryDto(obj: unknown): obj is ChatInstanceSummaryDto {
  return ChatInstanceSummarySchema.safeParse(obj).success;
}

// Mapeamento de domínio para DTO
export function mapToDto(instance: IChatInstance): ChatInstanceDto {
  return {
    id: instance.id,
    title: instance.title,
    description: instance.description,
    type: instance.type || 'DOCUMENT',
    widgetInstanceId: instance.widgetInstanceId,
    userId: instance.userId,
    createdAt: instance.createdAt,
    updatedAt: instance.updatedAt
  };
}

// Mapeamento de domínio para DTO de resumo
export function mapToSummaryDto(instance: IChatInstanceSummary): ChatInstanceDto {
  return {
    id: instance.id,
    title: instance.title,
    description: instance.description,
    type: instance.type || 'DOCUMENT',
    widgetInstanceId: instance.widgetInstanceId,
    userId: '', // Não disponível no resumo
    createdAt: instance.createdAt,
    updatedAt: instance.updatedAt
  };
}

// UpdateChatInstanceSchema and UpdateChatInstanceDto removed as they are unused
// and updateChatInstanceTitleStrict uses UpdateChatInstanceTitleDto directly. 