import { IUser } from '../../users/models/User.model';

/**
 * Authorization contract for SavedTableView. All checks are pure boolean
 * decisions based on role + ownership — no data access, no throws.
 */
export interface ISavedTableViewPolicy {
  /**
   * Whether the actor may view a view owned by ownerId.
   * @param actor - Authenticated user or null
   * @param ownerId - userId that owns the view
   */
  canView(actor: IUser | null, ownerId: string): boolean;

  /**
   * Whether the actor may update a view owned by ownerId.
   * @param actor - Authenticated user or null
   * @param ownerId - userId that owns the view
   */
  canUpdate(actor: IUser | null, ownerId: string): boolean;

  /**
   * Whether the actor may delete a view owned by ownerId.
   * @param actor - Authenticated user or null
   * @param ownerId - userId that owns the view
   */
  canDelete(actor: IUser | null, ownerId: string): boolean;
}
