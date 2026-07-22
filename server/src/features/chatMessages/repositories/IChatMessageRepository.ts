import { Prisma } from 'generated/prisma';
import { IChatMessage } from '../models/ChatMessage.model';

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
   * Retrieves a page of messages for a specific chat instance.
   * @param chatInstanceId - ID of the chat instance
   * @param skip - Number of messages to skip
   * @param take - Number of messages to return
   * @returns Array of messages
   */
  getMessagesByInstancePaged(chatInstanceId: string, skip: number, take: number): Promise<IChatMessage[]>;

  /**
   * Counts the messages of a chat instance.
   * @param chatInstanceId - ID of the chat instance
   * @returns Number of messages
   */
  countByInstance(chatInstanceId: string): Promise<number>;

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