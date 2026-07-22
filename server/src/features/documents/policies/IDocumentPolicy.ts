import { UserContext } from '../../../lib/authUtils';
import { IDocument } from '../models/Document.model';

/**
 * Interface defining the authorization rules for Document operations.
 */
export interface IDocumentPolicy {
  /**
   * Checks if a user can create a new document
   */
  canCreate(userContext: UserContext | null): boolean;

  /**
   * Checks if a user can list documents
   */
  canListAll(userContext: UserContext | null): boolean;

  /**
   * Checks if a user can view a specific document
   */
  canView(userContext: UserContext | null, document: IDocument): boolean;

  /**
   * Checks if a user can update a specific document
   */
  canUpdate(userContext: UserContext | null, document: IDocument): boolean;

  /**
   * Checks if a user can delete a specific document
   */
  canDelete(userContext: UserContext | null, document: IDocument): boolean;
}
