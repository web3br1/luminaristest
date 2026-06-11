import { UserContext } from '../../../types/UserContext';
import { IChatMessage } from '../models/ChatMessage.model';

/**
 * Interface defining the contract for ChatMessage authorization rules.
 * All methods should implement consistent authorization logic.
 */
export interface IChatMessagePolicy {
  /**
   * Checks if the actor can create a new chat message.
   * @param userContext - The user context attempting the action
   * @returns true if the actor has permission to create messages
   */
  canCreate(userContext: UserContext): boolean;

  /**
   * Checks if the actor can list all messages.
   * @param userContext - The user context attempting the action
   * @returns true if the actor has permission to list messages
   */
  canListAll(userContext: UserContext): boolean;

  /**
   * Checks if the actor can view a specific message.
   * @param userContext - The user context attempting the action
   * @param message - The message being viewed
   * @returns true if the actor has permission to view the message
   */
  canView(userContext: UserContext, message: IChatMessage): boolean;

  /**
   * Checks if the actor can update a specific message.
   * @param userContext - The user context attempting the action
   * @param message - The message being updated
   * @returns true if the actor has permission to update the message
   */
  canUpdate(userContext: UserContext, message: IChatMessage): boolean;

  /**
   * Checks if the actor can delete a specific message.
   * @param userContext - The user context attempting the action
   * @param message - The message being deleted
   * @returns true if the actor has permission to delete the message
   */
  canDelete(userContext: UserContext, message: IChatMessage): boolean;
} 