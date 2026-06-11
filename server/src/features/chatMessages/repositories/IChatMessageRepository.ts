import { Prisma } from 'generated/prisma';
import { IChatMessage, IChatMessageSummary, ChatMessageRole } from '../models/ChatMessage.model';

/**
 * Interface defining the contract for ChatMessage data access operations.
 * All methods should handle data access and transformation consistently.
 */
export interface IChatMessageRepository {
  /**
   * Creates a new chat message in the database.
   * @param data - Message creation data
   * @returns The created message with all fields
   */
  createMessage(data: Prisma.ChatMessageCreateInput): Promise<Prisma.ChatMessageGetPayload<{}>>;

  /**
   * Retrieves a paginated list of messages.
   * @param page - Page number (1-based)
   * @param limit - Number of items per page
   * @returns Object containing messages array and total count
   */
  getAllMessages(page?: number, limit?: number): Promise<{
    messages: IChatMessageSummary[];
    totalCount: number;
  }>;

  /**
   * Retrieves a message by its ID.
   * @param id - Message ID
   * @returns Message or null if not found
   */
  getMessageById(id: string): Promise<IChatMessage | null>;

  /**
   * Retrieves all messages for a specific chat instance.
   * @param chatInstanceId - ID of the chat instance
   * @returns Array of messages
   */
  getMessagesByInstance(chatInstanceId: string): Promise<IChatMessage[]>;

  /**
   * Updates a message.
   * @param id - Message ID
   * @param data - Update data
   * @returns Updated message
   */
  updateMessage(id: string, data: Prisma.ChatMessageUpdateInput): Promise<IChatMessage>;

  /**
   * Deletes a message.
   * @param id - Message ID
   * @returns Deleted message
   */
  deleteMessage(id: string): Promise<Prisma.ChatMessageGetPayload<{}>>;
} 