import prisma from '../../../lib/prisma'; // Changed to shared prisma instance
import { Prisma } from 'generated/prisma'; // Keep Prisma for types
import { MessageRole as PrismaMessageRole } from 'generated/prisma'; // Import runtime enum
import { IChatMessageRepository } from './IChatMessageRepository';
import { IChatMessage, ChatMessageRole } from '../models/ChatMessage.model';
import { NotFoundError, ServiceError } from '../../../lib/errors'; // For error handling

/**
 * Implementation of the ChatMessage repository.
 * Handles all data access operations for chat messages.
 */
export class ChatMessageRepository implements IChatMessageRepository {
  // private prisma: PrismaClient; // Removed: using shared prisma

  // constructor() { // Removed: using shared prisma
  //   this.prisma = new PrismaClient();
  // }

  /**
   * Converts domain ChatMessageRole to Prisma MessageRole
   * @param domainRole - Role in domain format
   * @returns Role in Prisma format
   */
  private convertDomainRoleToPrismaRole(domainRole: ChatMessageRole): PrismaMessageRole {
    // Map lower-case domain roles to uppercase Prisma enum values
    switch (domainRole) {
      case ChatMessageRole.USER:
        return PrismaMessageRole.USER;
      case ChatMessageRole.ASSISTANT:
        return PrismaMessageRole.ASSISTANT;
      default:
        throw new ServiceError(`Cannot persist message with unsupported role: ${domainRole}`);
    }
  }

  /**
   * Converts Prisma MessageRole to domain ChatMessageRole
   * @param prismaRole - Role in Prisma format
   * @returns Role in domain format
   */
  private convertPrismaRoleToDomainRole(prismaRole: PrismaMessageRole): ChatMessageRole {
    // Map uppercase Prisma enum back to lower-case domain role
    switch (prismaRole) {
      case PrismaMessageRole.USER:
        return ChatMessageRole.USER;
      case PrismaMessageRole.ASSISTANT:
        return ChatMessageRole.ASSISTANT;
      default:
        // Prisma enum does not support SYSTEM
        return ChatMessageRole.ASSISTANT;
    }
  }

  /**
   * Creates a new chat message
   * @param data - Message creation data
   * @returns Created message
   */
  async createMessage(data: Prisma.ChatMessageCreateInput): Promise<Prisma.ChatMessageGetPayload<{}>> {
    const prismaData = {
      ...data,
      role: this.convertDomainRoleToPrismaRole(data.role as ChatMessageRole)
    };

    return prisma.chatMessage.create({
      data: prismaData,
      select: {
        id: true,
        content: true,
        role: true,
        chatInstanceId: true,
        createdAt: true,
        updatedAt: true
      }
    });
  }

  /**
   * Retrieves a message by its ID
   * @param id - Message ID
   * @returns Message or null if not found
   */
  async getMessageById(id: string): Promise<IChatMessage | null> {
    const message = await prisma.chatMessage.findUnique({
      where: { id },
      select: {
        id: true,
        content: true,
        role: true,
        chatInstanceId: true,
        createdAt: true,
        updatedAt: true
      }
    });
    if (!message) return null;
    return {
      ...message,
      role: this.convertPrismaRoleToDomainRole(message.role as PrismaMessageRole)
    };
  }

  /**
   * Retrieves all messages for a specific chat instance
   * @param chatInstanceId - ID of the chat instance
   * @returns Array of messages
   */
  async getMessagesByInstance(chatInstanceId: string): Promise<IChatMessage[]> {
    const messages = await prisma.chatMessage.findMany({
      where: { chatInstanceId },
      select: {
        id: true,
        content: true,
        role: true,
        chatInstanceId: true,
        createdAt: true,
        updatedAt: true
      },
      orderBy: { createdAt: 'asc' }
    });
    return messages.map(msg => ({
      ...msg,
      role: this.convertPrismaRoleToDomainRole(msg.role as PrismaMessageRole)
    }));
  }

  async getMessagesByInstancePaged(chatInstanceId: string, skip: number, take: number): Promise<IChatMessage[]> {
    const messages = await prisma.chatMessage.findMany({
      where: { chatInstanceId },
      skip,
      take,
      select: {
        id: true,
        content: true,
        role: true,
        chatInstanceId: true,
        createdAt: true,
        updatedAt: true
      },
      orderBy: { createdAt: 'asc' }
    });
    return messages.map(msg => ({
      ...msg,
      role: this.convertPrismaRoleToDomainRole(msg.role as PrismaMessageRole)
    }));
  }

  async countByInstance(chatInstanceId: string): Promise<number> {
    return prisma.chatMessage.count({ where: { chatInstanceId } });
  }

  /**
   * Updates a message
   * @param id - Message ID
   * @param data - Update data
   * @returns Updated message
   */
  async updateMessage(id: string, data: Prisma.ChatMessageUpdateInput): Promise<IChatMessage> {
    try {
      const prismaData = { ...data };
      if (data.role) {
        prismaData.role = this.convertDomainRoleToPrismaRole(data.role as ChatMessageRole);
      }

      const updatedMessage = await prisma.chatMessage.update({
        where: { id },
        data: prismaData,
        select: {
          id: true,
          content: true,
          role: true,
          chatInstanceId: true,
          createdAt: true,
          updatedAt: true
        }
      });
      return {
        ...updatedMessage,
        role: this.convertPrismaRoleToDomainRole(updatedMessage.role as PrismaMessageRole)
      };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new NotFoundError('Message not found for update');
      }
      throw error;
    }
  }

  /**
   * Deletes a message
   * @param id - Message ID
   * @returns Deleted message
   */
  async deleteMessage(id: string): Promise<Prisma.ChatMessageGetPayload<{}>> {
    try {
      return await prisma.chatMessage.delete({
        where: { id },
        select: {
          id: true,
          content: true,
          role: true,
          chatInstanceId: true,
          createdAt: true,
          updatedAt: true
        }
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new NotFoundError('Message not found for deletion');
      }
      throw error;
    }
  }

} 