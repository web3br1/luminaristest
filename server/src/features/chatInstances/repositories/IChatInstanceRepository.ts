import { Prisma, ChatInstanceType } from 'generated/prisma';
import { IChatInstance, IChatInstanceSummary } from '../models/ChatInstance.model';

/**
 * Interface defining the contract for ChatInstance data access operations.
 * All methods should handle data access and transformation consistently.
 */
export interface IChatInstanceRepository {
  /**
   * Creates a new chat instance in the database.
   * @param data - Instance creation data
   * @returns The created instance with all fields
   */
  createInstance(data: Prisma.ChatInstanceCreateInput): Promise<Prisma.ChatInstanceGetPayload<{}>>;

  /**
   * Retrieves a paginated list of instances scoped to a specific user.
   * @param userId - User ID to filter by (required — prevents cross-tenant leaks)
   * @param page - Page number (1-based)
   * @param limit - Number of items per page
   * @returns Object containing instances array and total count
   */
  getAllInstances(userId: string, page?: number, limit?: number): Promise<{
    instances: IChatInstanceSummary[];
    totalCount: number;
  }>;

  /**
   * Retrieves an instance by its ID, scoped to the owning user.
   * Passing userId enforces ownership at the DB level so no post-fetch check
   * can be bypassed by a race condition.
   * @param id - Instance ID
   * @param userId - ID of the requesting user (ownership check)
   * @returns Instance or null if not found / not owned by userId
   */
  getInstanceById(id: string, userId: string): Promise<IChatInstance | null>;

  /**
   * Retrieves all instances for a specific user, optionally filtered by type.
   * @param userId - User ID
   * @param type - Optional instance type filter
   * @returns Array of instances
   */
  getInstancesByUser(userId: string, type?: ChatInstanceType): Promise<IChatInstance[]>;

  /**
   * Updates an instance.
   * @param id - Instance ID
   * @param data - Update data
   * @returns Updated instance
   */
  updateInstance(id: string, data: Prisma.ChatInstanceUpdateInput): Promise<IChatInstance>;

  /**
   * Deletes an instance.
   * @param id - Instance ID
   * @returns Deleted instance
   */
  deleteInstance(id: string): Promise<Prisma.ChatInstanceGetPayload<{}>>;
} 