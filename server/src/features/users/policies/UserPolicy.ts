import type { UserContext } from '../../../types/UserContext';
import { Role } from '../models/User.model'; // Use local Role enum
import { IUserPolicy } from './IUserPolicy';

/**
 * Defines authorization rules for User-related actions.
 */
export class UserPolicy implements IUserPolicy {
  /**
   * Checks if the actor can list all users.
   * Only ADMINs can.
   */
  canListAll(actor: UserContext | null): boolean {
    return !!actor && actor.role === Role.ADMIN;
  }

  /**
   * Checks if the actor can view a target user's profile (owner-or-admin).
   * ADMINs can view anyone; a non-admin USER may view only their OWN profile (tenant isolation).
   * There is intentionally no cross-tenant "public profile" view.
   */
  canView(actor: UserContext | null, targetUserId: string): boolean {
    if (!actor) return false; // Must be authenticated to view any user profile detail
    if (actor.role === Role.ADMIN) return true;
    return actor.userId === targetUserId;
  }

  /**
   * Checks if the actor can create a new user.
   * - Public signup: actor is null.
   * - Admin creating user: actor is ADMIN.
   * Regular USERs cannot create other users.
   */
  canCreate(actor: UserContext | null): boolean {
    // If actor is null, it's a public signup attempt, which is allowed by the endpoint's public nature.
    if (!actor) return true; 
    // If actor is present, only ADMIN can create users through an admin interface (not implemented yet)
    return actor.role === Role.ADMIN; 
  }

  /**
   * Checks if the actor can update a target user.
   * ADMINs can update anyone.
   * USERs can only update themselves.
   */
  canUpdate(actor: UserContext | null, targetUserId: string): boolean {
    if (!actor) return false;
    if (actor.role === Role.ADMIN) return true;
    return actor.userId === targetUserId;
  }

  /**
   * Checks if an actor can change a user's role (specifically during an update).
   * Only ADMINs can change roles.
   */
  canChangeRole(actor: UserContext | null): boolean {
    return !!actor && actor.role === Role.ADMIN;
  }

  /**
   * Checks if the actor can delete a target user. ADMIN only.
   *
   * Deleting a User is an admin-only lifecycle action: a User row cascade-deletes its business data
   * (documents, dynamic tables, dashboards, chat — see schema `onDelete: Cascade`), so self-service
   * hard-delete is intentionally disallowed. Account offboarding goes through an admin.
   * `targetUserId` is kept for interface symmetry but does not affect the decision.
   */
  canDelete(actor: UserContext | null, targetUserId: string): boolean {
    void targetUserId;
    return !!actor && actor.role === Role.ADMIN;
  }
} 