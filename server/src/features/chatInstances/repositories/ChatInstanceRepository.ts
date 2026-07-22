import prisma from '../../../lib/prisma';
import { Prisma, ChatInstanceType } from 'generated/prisma';
import { IChatInstanceRepository } from './IChatInstanceRepository';
import { IChatInstance, IChatInstanceSummary } from '../models/ChatInstance.model';
import { NotFoundError } from '../../../lib/errors';

/**
 * Implementation of the ChatInstance repository.
 * Handles all data access operations for chat instances.
 */
export class ChatInstanceRepository implements IChatInstanceRepository {
  /**
   * Creates a new chat instance
   * @param data - Instance creation data
   * @returns Created instance
   */
  async createInstance(data: Prisma.ChatInstanceCreateInput): Promise<Prisma.ChatInstanceGetPayload<{}>> {
    return prisma.chatInstance.create({
      data,
      select: {
        id: true,
        title: true,
        type: true,
        widgetInstanceId: true,
        userId: true,
        createdAt: true,
        updatedAt: true
      }
    });
  }

  /**
   * Retrieves a paginated list of instances
   * @param page - Page number (1-based)
   * @param limit - Number of items per page
   * @returns Object containing instances array and total count
   */
  async getAllInstances(userId: string, page: number = 1, limit: number = 10): Promise<{ instances: IChatInstanceSummary[]; totalCount: number; }> {
    const skip = (page - 1) * limit;

    // Scoped to the owner: multi-tenant isolation.
    const [instances, totalCount] = await prisma.$transaction([
      prisma.chatInstance.findMany({
        where: { userId },
        skip,
        take: limit,
        select: {
          id: true,
          title: true,
          type: true,
          widgetInstanceId: true,
          createdAt: true,
          updatedAt: true
        },
        orderBy: { updatedAt: 'desc' }
      }),
      prisma.chatInstance.count({ where: { userId } })
    ]);

    return { instances, totalCount };
  }

  /**
   * Retrieves an instance by its ID
   * @param id - Instance ID
   * @returns Instance or null if not found
   */
  async getInstanceById(id: string): Promise<IChatInstance | null> {
    const instance = await prisma.chatInstance.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        type: true,
        widgetInstanceId: true,
        userId: true,
        createdAt: true,
        updatedAt: true
      }
    });
    return instance;
  }

  /**
   * Retrieves all instances for a specific user, optionally filtered by type
   * @param userId - User ID
   * @param type - Optional instance type filter
   * @returns Array of instances
   */
  async getInstancesByUser(userId: string, type?: ChatInstanceType): Promise<IChatInstance[]> {
    const whereClause: Prisma.ChatInstanceWhereInput = { userId };
    if (type) {
      whereClause.type = type;
    }

    return prisma.chatInstance.findMany({
      where: whereClause,
      select: {
        id: true,
        title: true,
        type: true,
        widgetInstanceId: true,
        userId: true,
        createdAt: true,
        updatedAt: true
      },
      orderBy: { updatedAt: 'desc' }
    });
  }

  /**
   * Updates an instance
   * @param id - Instance ID
   * @param data - Update data
   * @returns Updated instance
   */
  async updateInstance(id: string, data: Prisma.ChatInstanceUpdateInput): Promise<IChatInstance> {
    try {
      const updatedInstance = await prisma.chatInstance.update({
        where: { id },
        data,
        select: {
          id: true,
          title: true,
          type: true,
          widgetInstanceId: true,
          userId: true,
          createdAt: true,
          updatedAt: true
        }
      });
      return updatedInstance;
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new NotFoundError('Instance not found for update');
      }
      throw error;
    }
  }

  /**
   * Deletes an instance
   * @param id - Instance ID
   * @returns Deleted instance
   */
  async deleteInstance(id: string): Promise<Prisma.ChatInstanceGetPayload<{}>> {
    try {
      return await prisma.chatInstance.delete({
        where: { id },
        select: {
          id: true,
          title: true,
          type: true,
          widgetInstanceId: true,
          userId: true,
          createdAt: true,
          updatedAt: true
        }
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new NotFoundError('Instance not found for deletion');
      }
      throw error;
    }
  }
} 