import { IDocument } from '../models/Document.model';
import { UserContext } from '../../../lib/authUtils';
import { IDocumentPolicy } from './IDocumentPolicy';

/**
 * Policy implementation for Document authorization rules.
 * Handles all authorization decisions for Document operations.
 */
export class DocumentPolicy implements IDocumentPolicy {
  /**
   * Checks if a user can create a new document
   * @param userContext - Current user's context
   * @returns True if user is authorized
   */
  canCreateDocument(userContext: UserContext | null): boolean {
    return !!userContext;
  }

  /**
   * Checks if a user can list all documents
   * @param userContext - Current user's context
   * @returns True if user is authorized
   */
  canListDocuments(userContext: UserContext | null): boolean {
    return !!userContext;
  }

  /**
   * Checks if a user can view a specific document
   * @param userContext - Current user's context
   * @param document - Document to check
   * @returns True if user is authorized
   */
  canViewDocument(userContext: UserContext | null, document: IDocument): boolean {
    if (!userContext) return false;
    return userContext.id === document.userId || userContext.role === 'ADMIN';
  }

  /**
   * Checks if a user can update a specific document
   * @param userContext - Current user's context
   * @param document - Document to check
   * @returns True if user is authorized
   */
  canUpdateDocument(userContext: UserContext | null, document: IDocument): boolean {
    if (!userContext) return false;
    return userContext.id === document.userId || userContext.role === 'ADMIN';
  }

  /**
   * Checks if a user can delete a specific document
   * @param userContext - Current user's context
   * @param document - Document to check
   * @returns True if user is authorized
   */
  canDeleteDocument(userContext: UserContext | null, document: IDocument): boolean {
    if (!userContext) return false;
    return userContext.id === document.userId || userContext.role === 'ADMIN';
  }
} 