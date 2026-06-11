import { UserContext } from '../../../types/UserContext';
import { IChatInstance } from '../models/ChatInstance.model';
import { IChatInstancePolicy } from './IChatInstancePolicy';

/**
 * Implementation of the ChatInstance policy.
 * Handles all authorization rules for chat instances.
 */
export class ChatInstancePolicy implements IChatInstancePolicy {
  /**
   * Checks if a user can create a chat instance
   * @param userContext - Context of the user performing the action
   * @returns True if user can create
   */
  canCreate(userContext: UserContext): boolean {
    return !!userContext.userId;
  }

  /**
   * Checks if a user can list all chat instances
   * @param userContext - Context of the user performing the action
   * @returns True if user can list all
   */
  canListAll(userContext: UserContext): boolean {
    return !!userContext.userId;
  }

  /**
   * Checks if a user can view a specific chat instance
   * @param userContext - Context of the user performing the action
   * @param instance - Instance to check
   * @returns True if user can view
   */
  canView(userContext: UserContext, instance: IChatInstance): boolean {
    return !!userContext.userId && instance.userId === userContext.userId;
  }

  /**
   * Checks if a user can update a specific chat instance
   * @param userContext - Context of the user performing the action
   * @param instance - Instance to check
   * @returns True if user can update
   */
  canUpdate(userContext: UserContext, instance: IChatInstance): boolean {
    return !!userContext.userId && instance.userId === userContext.userId;
  }

  /**
   * Checks if a user can delete a specific chat instance
   * @param userContext - Context of the user performing the action
   * @param instance - Instance to check
   * @returns True if user can delete
   */
  canDelete(userContext: UserContext, instance: IChatInstance): boolean {
    return !!userContext.userId && instance.userId === userContext.userId;
  }
} 