import { IUser, Role } from '../../users/models/User.model';
import { ISavedTableViewPolicy } from './ISavedTableViewPolicy';

/**
 * Authorization rules for SavedTableView: ADMIN may act on any view; a regular
 * user may act only on views they own. Pure boolean decisions — no throws.
 */
export class SavedTableViewPolicy implements ISavedTableViewPolicy {
  public canView(actor: IUser | null, ownerId: string): boolean {
    return this.isOwnerOrAdmin(actor, ownerId);
  }

  public canUpdate(actor: IUser | null, ownerId: string): boolean {
    return this.isOwnerOrAdmin(actor, ownerId);
  }

  public canDelete(actor: IUser | null, ownerId: string): boolean {
    return this.isOwnerOrAdmin(actor, ownerId);
  }

  private isOwnerOrAdmin(actor: IUser | null, ownerId: string): boolean {
    if (!actor) return false;
    if (actor.role === Role.ADMIN) return true;
    return actor.id === ownerId;
  }
}
