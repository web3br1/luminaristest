import { UserContext } from '../../../types/UserContext';
import { IChatMessage } from '../models/ChatMessage.model';
import { IChatMessagePolicy } from './IChatMessagePolicy';
import { ChatMessageRole } from '../models/ChatMessage.model';

/**
 * Defines authorization rules for ChatMessage-related actions.
 * Implements role-based access control for chat messages.
 */
export class ChatMessagePolicy implements IChatMessagePolicy {
  /**
   * Checks if the actor can create a new chat message.
   * User must be authenticated to create messages.
   * Service layer will validate if the target ChatInstance belongs to the user.
   */
  canCreate(userContext: UserContext): boolean {
    return !!userContext.userId;
  }

  /**
   * Checks if the actor can list all messages.
   * Authenticated users can list messages (presumably filtered to their own by the service).
   * Admin might have broader access (not implemented here).
   */
  canListAll(userContext: UserContext): boolean {
    return !!userContext.userId;
  }

  /**
   * Checks if the actor can view a specific message.
   * User must be authenticated and the message must belong to them (via ChatInstance owner).
   * Assumes message.userId is populated by the service with the ChatInstance owner's ID.
   */
  canView(userContext: UserContext, message: IChatMessage): boolean {
    if (!userContext.userId || !message.userId) return false;
    return message.userId === userContext.userId;
  }

  /**
   * Checks if the actor can update a specific message.
   * User must own the message.
   * Messages from 'assistant' or 'system' cannot be edited by 'user'.
   * Only the original sender can edit their messages.
   */
  canUpdate(userContext: UserContext, message: IChatMessage): boolean {
    if (!userContext.userId || !message.userId) return false;
    if (message.role !== ChatMessageRole.USER) return false;
    return message.userId === userContext.userId;
  }

  /**
   * Checks if the actor can delete a specific message.
   * User must own the message.
   * Messages from 'assistant' or 'system' cannot be deleted by 'user'.
   * Only the original sender can delete their messages.
   */
  canDelete(userContext: UserContext, message: IChatMessage): boolean {
    if (!userContext.userId || !message.userId) return false;
    if (message.role !== ChatMessageRole.USER) return false;
    return message.userId === userContext.userId;
  }
} 