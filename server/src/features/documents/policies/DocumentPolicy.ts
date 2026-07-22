import { IDocument } from '../models/Document.model';
import { UserContext } from '../../../lib/authUtils';
import { IDocumentPolicy } from './IDocumentPolicy';
import { Role } from '../../users/models/User.model';

/**
 * Policy implementation for Document authorization rules.
 * Handles all authorization decisions for Document operations.
 */
export class DocumentPolicy implements IDocumentPolicy {
  /**
   * Checks if a user can create a new document.
   */
  canCreate(userContext: UserContext | null): boolean {
    return !!userContext?.userId;
  }

  /**
   * Checks if a user can list documents.
   */
  canListAll(userContext: UserContext | null): boolean {
    return !!userContext?.userId;
  }

  /**
   * Checks if a user can view a specific document (owner-or-admin).
   */
  canView(userContext: UserContext | null, document: IDocument): boolean {
    if (!userContext) return false;
    return userContext.userId === document.userId || userContext.role === Role.ADMIN;
  }

  /**
   * Checks if a user can update a specific document (owner-or-admin).
   */
  canUpdate(userContext: UserContext | null, document: IDocument): boolean {
    if (!userContext) return false;
    return userContext.userId === document.userId || userContext.role === Role.ADMIN;
  }

  /**
   * Checks if a user can delete a specific document (owner-or-admin).
   */
  canDelete(userContext: UserContext | null, document: IDocument): boolean {
    if (!userContext) return false;
    return userContext.userId === document.userId || userContext.role === Role.ADMIN;
  }
}
