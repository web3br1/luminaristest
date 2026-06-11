import { UserContext } from '../../../lib/authUtils';
// import { TFunction } from 'next-i18next'; // Removed
import { ChatMessage, ChatInstance, MessageRole } from 'generated/prisma';
import {
  CreateChatMessageDto, 
  UpdateChatMessageDto, 
  ChatMessageDto, 
  ChatMessageSummaryDto, 
  isCreateChatMessageDto,
  isUpdateChatMessageDto,
  CreateChatMessageSchema, // Added for error details
  UpdateChatMessageSchema  // Added for error details
} from '../dtos/ChatMessageDto';
import { ChatMessageRepository } from '../repositories/ChatMessageRepository';
import { ChatInstanceRepository } from '../../chatInstances/repositories/ChatInstanceRepository';
import { ChatMessagePolicy } from '../policies/ChatMessagePolicy';
import type { IChatMessagePolicy } from '../policies/IChatMessagePolicy';
import type { IChatMessageRepository } from '../repositories/IChatMessageRepository';
// Standardized error imports
import { AppError, ServiceError, ForbiddenError, NotFoundError, UnauthorizedError, ValidationError } from '../../../lib/errors';
import { OpenAIService } from '../../../lib/openai/OpenAIService';
import { getFactory } from '../../../lib/factory';
import OpenAI from 'openai';
import type { IChatMessage } from '../models/ChatMessage.model';
import { ChatMessageRole } from '../models/ChatMessage.model'; // Import enum
import type { IChatInstanceRepository } from '../../chatInstances/repositories/IChatInstanceRepository';
import type { Prisma } from 'generated/prisma'; // For Prisma.ChatMessageUpdateInput

/**
 * Service responsible for managing chat messages.
 * Handles business logic, validation, and authorization for message operations.
 */
export class ChatMessageService {
  constructor(
    private chatMessageRepository: IChatMessageRepository,
    private chatInstanceRepository: IChatInstanceRepository,
    private chatMessagePolicy: IChatMessagePolicy
  ) {}

  /**
   * Enriches a message with user ID from its chat instance
   * @param message - Message to enrich
   * @returns Enriched message with user ID
   * @throws {ServiceError} If chat instance is missing
   * @throws {NotFoundError} If chat instance not found
   */
  private async enrichMessageWithUserId(message: Omit<IChatMessage, 'userId' | 'updatedAt' | 'createdAt'> & { updatedAt?: Date, createdAt?: Date }): Promise<IChatMessage> {
    if (!message.chatInstanceId) {
      throw new ServiceError('Message is missing chatInstanceId');
    }

    const chatInstance = await this.chatInstanceRepository.getInstanceById(message.chatInstanceId);
    if (!chatInstance) {
      throw new NotFoundError('Associated ChatInstance not found for message');
    }

    return {
      ...message, 
      userId: chatInstance.userId,
      createdAt: message.createdAt || new Date(),
      updatedAt: message.updatedAt || new Date()
    };
  }

  /**
   * Creates a new chat message
   * @param data - Message creation data
   * @param userContext - Context of the user performing the action
   * @returns Created message
   * @throws {UnauthorizedError} If user is not authenticated
   * @throws {ValidationError} If data is invalid
   * @throws {NotFoundError} If chat instance not found
   * @throws {ForbiddenError} If user cannot access chat instance or create message
   * @throws {ServiceError} If message creation fails
   */
  async createMessage(data: CreateChatMessageDto, userContext: UserContext): Promise<ChatMessageDto> {
    if (!userContext.userId) {
      throw new UnauthorizedError('Authentication required');
    }

    const validationResult = CreateChatMessageSchema.safeParse(data);
    if (!validationResult.success) {
      throw new ValidationError('Invalid message creation data', validationResult.error.flatten().fieldErrors);
    }

    const chatInstance = await this.chatInstanceRepository.getInstanceById(data.chatInstanceId);
    if (!chatInstance) {
      throw new NotFoundError('Chat instance not found');
    }

    if (chatInstance.userId !== userContext.userId) {
      throw new ForbiddenError('Access to chat instance forbidden');
    }

    if (!this.chatMessagePolicy.canCreate(userContext)) {
      throw new ForbiddenError('Message creation forbidden by policy');
    }

    // Persist the user's message
    // Dados da mensagem a ser criada
    const messageData: Prisma.ChatMessageCreateInput = {
      content: data.content,
      role: data.role as unknown as MessageRole,
      chatInstance: { connect: { id: data.chatInstanceId } }
    };
    
    // Criar a mensagem no repositório
    const createdPrismaMessage = await this.chatMessageRepository.createMessage(messageData);
    
    // Recuperar a mensagem criada com todos os detalhes
    let domainMessage = await this.chatMessageRepository.getMessageById(createdPrismaMessage.id);
    
    // Log para debug
    console.log(`Mensagem ${data.role} criada com sucesso. ID: ${createdPrismaMessage.id}`);
    
    // Importante: Removida a geração automática de resposta da IA
    // As respostas agora são geradas exclusivamente através do endpoint /api/chat
    if (!domainMessage) {
      throw new ServiceError('Failed to retrieve created message');
    }
    domainMessage = await this.enrichMessageWithUserId(domainMessage);
    return this.mapToDto(domainMessage);
  }

  /**
   * Retrieves a message by ID
   * @param id - Message ID
   * @param userContext - Context of the user performing the action
   * @returns Message
   * @throws {UnauthorizedError} If user is not authenticated
   * @throws {NotFoundError} If message not found
   * @throws {ForbiddenError} If user cannot view message
   */
  async getMessageById(id: string, userContext: UserContext): Promise<ChatMessageDto> {
    if (!userContext.userId) {
      throw new UnauthorizedError('Authentication required');
    }

    let message = await this.chatMessageRepository.getMessageById(id);
    if (!message) {
      throw new NotFoundError('Message not found');
    }

    message = await this.enrichMessageWithUserId(message);

    if (!this.chatMessagePolicy.canView(userContext, message)) {
      throw new ForbiddenError('Message view forbidden by policy');
    }

    return this.mapToDto(message);
  }

  /**
   * Retrieves all messages for a chat instance
   * @param chatInstanceId - Chat instance ID
   * @param userContext - Context of the user performing the action
   * @returns Array of messages
   * @throws {UnauthorizedError} If user is not authenticated
   * @throws {NotFoundError} If chat instance not found
   * @throws {ForbiddenError} If user cannot access chat instance or list messages
   */
  async getMessagesByInstance(chatInstanceId: string, userContext: UserContext): Promise<ChatMessageSummaryDto[]> {
    if (!userContext.userId) {
      throw new UnauthorizedError('Authentication required');
    }

    const chatInstance = await this.chatInstanceRepository.getInstanceById(chatInstanceId);
    if (!chatInstance) {
      throw new NotFoundError('Chat instance not found');
    }

    if (chatInstance.userId !== userContext.userId) {
      throw new ForbiddenError('Access to chat instance forbidden');
    }
    
    if (!this.chatMessagePolicy.canListAll(userContext)) {
      throw new ForbiddenError('Message listing forbidden by policy');
    }

    const messages = await this.chatMessageRepository.getMessagesByInstance(chatInstanceId);
    const enrichedMessages = await Promise.all(messages.map(msg => this.enrichMessageWithUserId(msg)));
    return enrichedMessages.map(msg => this.mapToSummaryDto(msg));
  }

  /**
   * Updates a message
   * @param id - Message ID
   * @param data - Update data
   * @param userContext - Context of the user performing the action
   * @returns Updated message
   * @throws {UnauthorizedError} If user is not authenticated
   * @throws {ValidationError} If data is invalid
   * @throws {NotFoundError} If message not found
   * @throws {ForbiddenError} If user cannot update message
   * @throws {ServiceError} If message update fails
   */
  async updateMessage(id: string, data: UpdateChatMessageDto, userContext: UserContext): Promise<ChatMessageDto> {
    if (!userContext.userId) {
      throw new UnauthorizedError('Authentication required');
    }

    const validationResult = UpdateChatMessageSchema.safeParse(data);
    if (!validationResult.success) {
      throw new ValidationError('Invalid message update data', validationResult.error.flatten().fieldErrors);
    }

    let messageToUpdate = await this.chatMessageRepository.getMessageById(id);
    if (!messageToUpdate) {
      throw new NotFoundError('Message not found');
    }

    messageToUpdate = await this.enrichMessageWithUserId(messageToUpdate);

    if (!this.chatMessagePolicy.canUpdate(userContext, messageToUpdate)) {
      throw new ForbiddenError('Message update forbidden by policy');
    }

    try {
      const updatePayload: Prisma.ChatMessageUpdateInput = {};
      if (data.content !== undefined) updatePayload.content = data.content;
      if (data.role !== undefined) updatePayload.role = data.role as unknown as MessageRole;

      if (Object.keys(updatePayload).length === 0) {
        return this.mapToDto(messageToUpdate);
      }

      const updatedMessage = await this.chatMessageRepository.updateMessage(id, updatePayload);
      const finalMessage = await this.enrichMessageWithUserId(updatedMessage);
      return this.mapToDto(finalMessage);
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new ServiceError('Failed to update message');
    }
  }

  /**
   * Deletes a message
   * @param id - Message ID
   * @param userContext - Context of the user performing the action
   * @throws {UnauthorizedError} If user is not authenticated
   * @throws {NotFoundError} If message not found
   * @throws {ForbiddenError} If user cannot delete message
   * @throws {ServiceError} If message deletion fails
   */
  async deleteMessage(id: string, userContext: UserContext): Promise<void> {
    if (!userContext.userId) {
      throw new UnauthorizedError('Authentication required');
    }

    let messageToDelete = await this.chatMessageRepository.getMessageById(id);
    if (!messageToDelete) {
      throw new NotFoundError('Message not found');
    }

    messageToDelete = await this.enrichMessageWithUserId(messageToDelete);

    if (!this.chatMessagePolicy.canDelete(userContext, messageToDelete)) {
      throw new ForbiddenError('Message deletion forbidden by policy');
    }

    try {
      await this.chatMessageRepository.deleteMessage(id);
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new ServiceError('Failed to delete message');
    }
  }

  /**
   * Maps a domain message to DTO
   * @param message - Domain message
   * @returns Message DTO
   */
  private mapToDto(message: IChatMessage): ChatMessageDto {
    return {
      id: message.id,
      content: message.content,
      role: message.role,
      chatInstanceId: message.chatInstanceId,
      createdAt: message.createdAt,
      updatedAt: message.updatedAt
    };
  }

  /**
   * Maps a domain message to summary DTO
   * @param message - Domain message
   * @returns Message summary DTO
   */
  private mapToSummaryDto(message: IChatMessage): ChatMessageSummaryDto {
    return {
      id: message.id,
      content: message.content,
      role: message.role,
      createdAt: message.createdAt
    };
  }
} 