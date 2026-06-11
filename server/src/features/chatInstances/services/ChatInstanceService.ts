import { UserContext } from '../../../types/UserContext';
import type { IChatInstanceRepository } from '../repositories/IChatInstanceRepository';
import type { IChatInstancePolicy } from '../policies/IChatInstancePolicy';
import type { IChatInstance, IChatInstanceSummary } from '../models/ChatInstance.model';
import type { Prisma } from 'generated/prisma';
import {
  CreateChatInstanceDto,
  UpdateChatInstanceDto,
  ChatInstanceDto,
  ChatInstanceSummaryDto,
  CreateChatInstanceSchema,
  UpdateChatInstanceSchema,
  isCreateChatInstanceDto,
  isUpdateChatInstanceDto,
  mapToDto,
  mapToSummaryDto
} from '../dtos/ChatInstanceDto';
import { ServiceError, ForbiddenError, NotFoundError, UnauthorizedError, ValidationError } from '../../../lib/errors';

/**
 * Service responsible for managing chat instances.
 * Handles business logic, validation, and authorization for instance operations.
 */
export class ChatInstanceService {
  constructor(
    private readonly chatInstanceRepository: IChatInstanceRepository,
    private readonly chatInstancePolicy: IChatInstancePolicy
  ) { }

  /**
   * Creates a new chat instance
   * @param data - Instance creation data
   * @param userContext - Context of the user performing the action
   * @returns Created instance
   * @throws {UnauthorizedError} If user is not authenticated
   * @throws {ValidationError} If data is invalid
   * @throws {ForbiddenError} If user cannot create instance
   * @throws {ServiceError} If instance creation fails
   */
  async createInstance(data: CreateChatInstanceDto, userContext: UserContext): Promise<ChatInstanceDto> {
    if (!userContext.userId) {
      throw new UnauthorizedError('Authentication required');
    }

    const validationResult = CreateChatInstanceSchema.safeParse(data);
    if (!validationResult.success) {
      throw new ValidationError('Invalid instance creation data', validationResult.error.flatten().fieldErrors);
    }

    if (!this.chatInstancePolicy.canCreate(userContext)) {
      throw new ForbiddenError('Instance creation forbidden by policy');
    }

    try {
      const instanceDataForRepo: Prisma.ChatInstanceCreateInput = {
        ...data,
        user: {
          connect: {
            id: userContext.userId
          }
        }
      };

      const createdInstance = await this.chatInstanceRepository.createInstance(instanceDataForRepo);
      return mapToDto(createdInstance);
    } catch (error: unknown) {
      // If instance already exists for this user and widgetId (unique constraint), return the existing one
      if (!(error instanceof ServiceError)) {
        try {
          const userInstances = await this.chatInstanceRepository.getInstancesByUser(userContext.userId);
          const existing = userInstances.find(inst => inst.widgetInstanceId === data.widgetInstanceId);
          if (existing) {
            return mapToDto(existing);
          }
        } catch {
          // ignore failures in fetching existing instance
        }
      }
      if (error instanceof ServiceError) throw error;
      throw new ServiceError('Failed to create instance');
    }
  }

  /**
   * Retrieves a paginated list of instances
   * @param userContext - Context of the user performing the action
   * @param page - Page number (1-based)
   * @param limit - Number of items per page
   * @returns Object containing instances array and total count
   * @throws {UnauthorizedError} If user is not authenticated
   * @throws {ForbiddenError} If user cannot list instances
   */
  async getAllInstances(userContext: UserContext, page?: number, limit?: number): Promise<{ instances: ChatInstanceSummaryDto[]; totalCount: number; }> {
    if (!userContext.userId) {
      throw new UnauthorizedError('Authentication required');
    }

    if (!this.chatInstancePolicy.canListAll(userContext)) {
      throw new ForbiddenError('Instance listing forbidden by policy');
    }

    const result = await this.chatInstanceRepository.getAllInstances(userContext.userId, page, limit);
    return {
      instances: result.instances.map(instance => mapToSummaryDto(instance)),
      totalCount: result.totalCount
    };
  }

  /**
   * Retrieves an instance by ID
   * @param id - Instance ID
   * @param userContext - Context of the user performing the action
   * @returns Instance
   * @throws {UnauthorizedError} If user is not authenticated
   * @throws {NotFoundError} If instance not found
   * @throws {ForbiddenError} If user cannot view instance
   */
  async getInstanceById(id: string, userContext: UserContext): Promise<ChatInstanceDto> {
    if (!userContext.userId) {
      throw new UnauthorizedError('Authentication required');
    }

    const instance = await this.chatInstanceRepository.getInstanceById(id, userContext.userId);
    if (!instance) {
      // Return NotFoundError regardless of whether the instance exists but belongs to
      // another user — avoids leaking the existence of foreign resources.
      throw new NotFoundError('Instance not found');
    }

    if (!this.chatInstancePolicy.canView(userContext, instance)) {
      throw new ForbiddenError('Instance view forbidden by policy');
    }

    return mapToDto(instance);
  }

  /**
   * Retrieves all instances for a user, optionally filtered by type
   * @param userContext - Context of the user performing the action
   * @param type - Optional instance type filter ('DOCUMENT' | 'GENERIC')
   * @returns Array of instances
   * @throws {UnauthorizedError} If user is not authenticated
   * @throws {ForbiddenError} If user cannot list instances
   */
  async getInstancesByUser(userContext: UserContext, type?: 'DOCUMENT' | 'GENERIC'): Promise<ChatInstanceDto[]> {
    if (!userContext.userId) {
      throw new UnauthorizedError('Authentication required');
    }

    if (!this.chatInstancePolicy.canListAll(userContext)) {
      throw new ForbiddenError('Instance listing forbidden by policy');
    }

    const instances = await this.chatInstanceRepository.getInstancesByUser(userContext.userId, type);
    return instances.map(instance => mapToDto(instance));
  }

  /**
   * Gets an existing instance by widgetInstanceId or creates a new one if not found.
   * This is the preferred method for chat initialization to avoid duplicates.
   * @param widgetInstanceId - The widget instance ID to look up
   * @param type - Instance type ('DOCUMENT' | 'GENERIC')
   * @param userContext - Context of the user performing the action
   * @returns Existing or newly created instance
   */
  async getOrCreateInstance(widgetInstanceId: string, type: 'DOCUMENT' | 'GENERIC', userContext: UserContext): Promise<ChatInstanceDto> {
    if (!userContext.userId) {
      throw new UnauthorizedError('Authentication required');
    }

    if (!this.chatInstancePolicy.canCreate(userContext)) {
      throw new ForbiddenError('Instance access forbidden by policy');
    }

    // First, try to find existing instance
    const existingInstances = await this.chatInstanceRepository.getInstancesByUser(userContext.userId, type);
    const existing = existingInstances.find(inst => inst.widgetInstanceId === widgetInstanceId);

    if (existing) {
      return mapToDto(existing);
    }

    // Create new instance
    try {
      const instanceDataForRepo: Prisma.ChatInstanceCreateInput = {
        widgetInstanceId,
        type,
        title: null,
        user: {
          connect: {
            id: userContext.userId
          }
        }
      };

      const createdInstance = await this.chatInstanceRepository.createInstance(instanceDataForRepo);
      return mapToDto(createdInstance);
    } catch (error) {
      // If unique constraint violation, try to fetch again (race condition)
      const retryInstances = await this.chatInstanceRepository.getInstancesByUser(userContext.userId, type);
      const retryExisting = retryInstances.find(inst => inst.widgetInstanceId === widgetInstanceId);
      if (retryExisting) {
        return mapToDto(retryExisting);
      }
      if (error instanceof ServiceError) throw error;
      throw new ServiceError('Failed to get or create instance');
    }
  }


  /**
   * Updates an instance
   * @param id - Instance ID
   * @param data - Update data
   * @param userContext - Context of the user performing the action
   * @returns Updated instance
   * @throws {UnauthorizedError} If user is not authenticated
   * @throws {ValidationError} If data is invalid
   * @throws {NotFoundError} If instance not found
   * @throws {ForbiddenError} If user cannot update instance
   * @throws {ServiceError} If instance update fails
   */
  async updateInstance(id: string, data: UpdateChatInstanceDto, userContext: UserContext): Promise<ChatInstanceDto> {
    if (!userContext.userId) {
      throw new UnauthorizedError('Authentication required');
    }

    const validationResult = UpdateChatInstanceSchema.safeParse(data);
    if (!validationResult.success) {
      throw new ValidationError('Invalid instance update data', validationResult.error.flatten().fieldErrors);
    }

    const instance = await this.chatInstanceRepository.getInstanceById(id, userContext.userId);
    if (!instance) {
      throw new NotFoundError('Instance not found');
    }

    if (!this.chatInstancePolicy.canUpdate(userContext, instance)) {
      throw new ForbiddenError('Instance update forbidden by policy');
    }

    try {
      const updatePayload: Prisma.ChatInstanceUpdateInput = {};
      if (data.title !== undefined) updatePayload.title = data.title;
      if (data.widgetInstanceId !== undefined) updatePayload.widgetInstanceId = data.widgetInstanceId;

      if (Object.keys(updatePayload).length === 0) {
        return mapToDto(instance);
      }

      const updatedInstance = await this.chatInstanceRepository.updateInstance(id, updatePayload);
      return mapToDto(updatedInstance);
    } catch (error) {
      if (error instanceof ServiceError) throw error;
      throw new ServiceError('Failed to update instance');
    }
  }

  /**
   * Deletes an instance
   * @param id - Instance ID
   * @param userContext - Context of the user performing the action
   * @throws {UnauthorizedError} If user is not authenticated
   * @throws {NotFoundError} If instance not found
   * @throws {ForbiddenError} If user cannot delete instance
   * @throws {ServiceError} If instance deletion fails
   */
  async deleteInstance(id: string, userContext: UserContext): Promise<void> {
    if (!userContext.userId) {
      throw new UnauthorizedError('Authentication required');
    }

    const instance = await this.chatInstanceRepository.getInstanceById(id, userContext.userId);
    if (!instance) {
      throw new NotFoundError('Instance not found');
    }

    if (!this.chatInstancePolicy.canDelete(userContext, instance)) {
      throw new ForbiddenError('Instance deletion forbidden by policy');
    }

    try {
      await this.chatInstanceRepository.deleteInstance(id);
    } catch (error) {
      if (error instanceof ServiceError) throw error;
      throw new ServiceError('Failed to delete instance');
    }
  }
} 