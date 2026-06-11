import prisma from '../../../lib/prisma'; // Changed to shared prisma instance
import { Prisma } from 'generated/prisma'; // Keep Prisma for types
import { MessageRole as PrismaMessageRole } from 'generated/prisma'; // Import runtime enum
import { IChatMessageRepository } from './IChatMessageRepository';
import { IChatMessage, IChatMessageSummary, ChatMessageRole } from '../models/ChatMessage.model';
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
   * Retrieves a paginated list of messages
   * @param page - Page number (1-based)
   * @param limit - Number of items per page
   * @returns Object containing messages array and total count
   */
  async getAllMessages(page: number = 1, limit: number = 10): Promise<{ messages: IChatMessageSummary[]; totalCount: number; }> {
    const skip = (page - 1) * limit;
    
    const [rawMessages, totalCount] = await prisma.$transaction([
      prisma.chatMessage.findMany({
        skip,
        take: limit,
        select: {
          id: true,
          content: true,
          role: true,
          createdAt: true
        },
        orderBy: { createdAt: 'desc' }
      }),
      prisma.chatMessage.count()
    ]);

    const messages = rawMessages.map(msg => ({
      ...msg,
      role: this.convertPrismaRoleToDomainRole(msg.role as PrismaMessageRole),
    }));

    return { messages, totalCount };
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
  async getMessagesByInstance(chatInstanceId: string, page: number = 1, limit: number = 50): Promise<{ messages: IChatMessage[]; total: number }> {
    const safeLimit = Math.min(Math.max(1, limit), 200);
    const safePage = Math.max(1, page);
    const skip = (safePage - 1) * safeLimit;

    const where = { chatInstanceId };

    const [rows, total] = await Promise.all([
      prisma.chatMessage.findMany({
        where,
        select: {
          id: true,
          content: true,
          role: true,
          chatInstanceId: true,
          createdAt: true,
          updatedAt: true
        },
        orderBy: { createdAt: 'asc' },
        skip,
        take: safeLimit,
      }),
      prisma.chatMessage.count({ where }),
    ]);

    const messages = rows.map(msg => ({
      ...msg,
      role: this.convertPrismaRoleToDomainRole(msg.role as PrismaMessageRole)
    }));

    return { messages, total };
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

  // Methods below were public but not in IChatMessageRepository
  // They can be made private, moved to service, or added to interface if they are core contract.
  // For now, commenting them out to align with the guide's simpler repository structure.

  // public async findById(id: string, includeChatInstance: boolean = false): Promise<(Prisma.ChatMessageGetPayload<{ include: { chatInstance: true } }> | Prisma.ChatMessageGetPayload<{}>) | null> {
  //   const message = await prisma.chatMessage.findUnique({
  //     where: { id },
  //     include: { chatInstance: includeChatInstance },
  //   });
  //   if (!message) return null;
  //   return {
  //     ...message,
  //     role: this.convertRole(message.role),
  //     ...(message.chatInstance && { chatInstance: message.chatInstance })
  //   };
  // }

  // public async findAllByChatInstanceId(
  //   chatInstanceId: string, 
  //   limit?: number, 
  //   cursor?: string,
  //   orderByDirection: 'asc' | 'desc' = 'asc'
  // ): Promise<IChatMessage[]> {
  //   const messages = await prisma.chatMessage.findMany({
  //     where: { chatInstanceId },
  //     select: {
  //       id: true,
  //       content: true,
  //       role: true,
  //       chatInstanceId: true,
  //       createdAt: true,
  //       updatedAt: true,
  //     },
  //     take: limit,
  //     skip: cursor ? 1 : undefined,
  //     cursor: cursor ? { id: cursor } : undefined,
  //     orderBy: { createdAt: orderByDirection },
  //   });
  //   return messages.map(msg => ({
  //       ...msg,
  //       role: this.convertRole(msg.role)
  //   }));
  // }

  // public async delete(id: string): Promise<void> { // This is a duplicate of deleteMessage with different return
  //   try {
  //     await prisma.chatMessage.delete({ where: { id } });
  //   } catch (error) {
  //     if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
  //       return; // Record not found, consider it deleted
  //     }
  //     console.error('Error deleting chat message:', error);
  //     throw error;
  //   }
  // }

  // public async deleteManyByChatInstanceId(chatInstanceId: string): Promise<void> {
  //   try {
  //     await prisma.chatMessage.deleteMany({ where: { chatInstanceId } });
  //   } catch (error) {
  //     console.error('Error deleting chat messages by instance:', error);
  //     throw error;
  //   }
  // }
} 