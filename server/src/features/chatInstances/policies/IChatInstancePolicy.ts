import { UserContext } from '../../../types/UserContext';
import { IChatInstance } from '../models/ChatInstance.model';

/**
 * Interface defining the contract for ChatInstance access control policies.
 * All methods should handle authorization consistently.
 */
export interface IChatInstancePolicy {
  /**
   * Checks if a user can create a chat instance
   * @param userContext - Context of the user performing the action
   * @returns True if user can create
   */
  canCreate(userContext: UserContext): boolean;

  /**
   * Checks if a user can list all chat instances
   * @param userContext - Context of the user performing the action
   * @returns True if user can list all
   */
  canListAll(userContext: UserContext): boolean;

  /**
   * Checks if a user can view a specific chat instance
   * @param userContext - Context of the user performing the action
   * @param instance - Instance to check
   * @returns True if user can view
   */
  canView(userContext: UserContext, instance: IChatInstance): boolean;

  /**
   * Checks if a user can update a specific chat instance
   * @param userContext - Context of the user performing the action
   * @param instance - Instance to check
   * @returns True if user can update
   */
  canUpdate(userContext: UserContext, instance: IChatInstance): boolean;

  /**
   * Checks if a user can delete a specific chat instance
   * @param userContext - Context of the user performing the action
   * @param instance - Instance to check
   * @returns True if user can delete
   */
  canDelete(userContext: UserContext, instance: IChatInstance): boolean;
} 