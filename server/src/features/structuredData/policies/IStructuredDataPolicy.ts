import type { UserContext } from '@/types/UserContext';

/**
 * Authorization contract for structured-data access.
 */
export interface IStructuredDataPolicy {
  /**
   * Whether the user may view or modify the structured data of a document.
   * Rule: the user must own the document (no admin bypass).
   */
  canAccess(ctx: UserContext, documentId: string): Promise<boolean>;
}
