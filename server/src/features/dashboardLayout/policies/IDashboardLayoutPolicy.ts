import { UserContext } from '../../../types/UserContext';
import { IDashboardLayout } from '../models/DashboardLayout.model';

/**
 * Interface defining the contract for DashboardLayout authorization rules.
 * All methods should implement consistent authorization logic.
 */
export interface IDashboardLayoutPolicy {
  /**
   * Checks if the user can list all dashboard layouts.
   * @param userContext - The user context containing authentication and role information
   * @returns true if the user has permission to list all layouts
   */
  canListAll(userContext: UserContext): boolean;

  /**
   * Checks if the user can view a specific dashboard layout.
   * @param userContext - The user context containing authentication and role information
   * @param layout - The layout being viewed
   * @returns true if the user has permission to view the layout
   */
  canView(userContext: UserContext, layout: IDashboardLayout): boolean;

  /**
   * Checks if the user can create a new dashboard layout.
   * @param userContext - The user context containing authentication and role information
   * @returns true if the user has permission to create layouts
   */
  canCreate(userContext: UserContext): boolean;

  /**
   * Checks if the user can update a specific dashboard layout.
   * @param userContext - The user context containing authentication and role information
   * @param layout - The layout being updated
   * @returns true if the user has permission to update the layout
   */
  canUpdate(userContext: UserContext, layout: IDashboardLayout): boolean;

  /**
   * Checks if the user can delete a specific dashboard layout.
   * @param userContext - The user context containing authentication and role information
   * @param layout - The layout being deleted
   * @returns true if the user has permission to delete the layout
   */
  canDelete(userContext: UserContext, layout: IDashboardLayout): boolean;
} 