import type { IUser } from '../models/User.model';
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
  canListAll(actor: IUser | null): boolean {
    return !!actor && actor.role === Role.ADMIN;
  }

  /**
   * Checks if the actor can view a target user's profile.
   * ADMINs can view anyone.
   * USERs can view their own profile fully.
   * USERs can view limited public profiles of others.
   * (For simplicity in this method, we just check if they can view *something*.
   * The service layer will handle stripping down fields for public views.)
   */
  canView(actor: IUser | null, targetUserId: string): boolean {
    if (!actor) return false; // Must be authenticated to view any user profile detail
    if (actor.role === Role.ADMIN) return true;
    // Users can view themselves, and (based on requirements) other users (limited view)
    return true; 
  }

  /**
   * Checks if the actor can create a new user.
   * - Public signup: actor is null.
   * - Admin creating user: actor is ADMIN.
   * Regular USERs cannot create other users.
   */
  canCreate(actor: IUser | null): boolean {
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
  canUpdate(actor: IUser | null, targetUserId: string): boolean {
    if (!actor) return false;
    if (actor.role === Role.ADMIN) return true;
    return actor.id === targetUserId;
  }

  /**
   * Checks if an actor can change a user's role (specifically during an update).
   * Only ADMINs can change roles.
   */
  canChangeRole(actor: IUser | null): boolean {
    return !!actor && actor.role === Role.ADMIN;
  }

  /**
   * Checks if the actor can delete a target user.
   * ADMINs can delete anyone.
   * USERs can only delete themselves.
   */
  canDelete(actor: IUser | null, targetUserId: string): boolean {
    if (!actor) return false;
    if (actor.role === Role.ADMIN) return true;
    return actor.id === targetUserId;
  }
} 