import type { IUser } from '../models/User.model';

/**
 * Interface defining the contract for User authorization rules.
 * All methods should implement consistent authorization logic.
 */
export interface IUserPolicy {
  /**
   * Checks if the actor can list all users.
   * @param actor - The user attempting the action, or null for unauthenticated requests
   * @returns true if the actor has permission to list all users
   */
  canListAll(actor: IUser | null): boolean;

  /**
   * Checks if the actor can view a target user's profile.
   * @param actor - The user attempting the action, or null for unauthenticated requests
   * @param targetUserId - ID of the user being viewed
   * @returns true if the actor has permission to view the target user
   */
  canView(actor: IUser | null, targetUserId: string): boolean;

  /**
   * Checks if the actor can create a new user.
   * @param actor - The user attempting the action, or null for public signup
   * @returns true if the actor has permission to create users
   */
  canCreate(actor: IUser | null): boolean;

  /**
   * Checks if the actor can update a target user.
   * @param actor - The user attempting the action, or null for unauthenticated requests
   * @param targetUserId - ID of the user being updated
   * @returns true if the actor has permission to update the target user
   */
  canUpdate(actor: IUser | null, targetUserId: string): boolean;

  /**
   * Checks if the actor can change a user's role.
   * @param actor - The user attempting the action, or null for unauthenticated requests
   * @returns true if the actor has permission to change user roles
   */
  canChangeRole(actor: IUser | null): boolean;

  /**
   * Checks if the actor can delete a target user.
   * @param actor - The user attempting the action, or null for unauthenticated requests
   * @param targetUserId - ID of the user being deleted
   * @returns true if the actor has permission to delete the target user
   */
  canDelete(actor: IUser | null, targetUserId: string): boolean;
} 