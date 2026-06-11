import { UserContext } from '../../../types/UserContext';
import { IDashboardLayout } from '../models/DashboardLayout.model';
import { Role } from '../../../features/users/models/User.model';
import { IDashboardLayoutPolicy } from './IDashboardLayoutPolicy';

/**
 * Defines authorization rules for DashboardLayout-related actions.
 * Implements business rules for layout access control.
 */
export class DashboardLayoutPolicy implements IDashboardLayoutPolicy {
  /**
   * Checks if the user can list all dashboard layouts.
   * Only ADMINs can list all layouts.
   * @param userContext - The user context containing authentication and role information
   * @returns true if the user has permission to list all layouts
   */
  public canListAll(userContext: UserContext): boolean {
    if (!userContext.userId) return false;
    return userContext.role === Role.ADMIN;
  }

  /**
   * Checks if the user can view a specific dashboard layout.
   * ADMINs can view any layout.
   * Regular users can only view their own layouts.
   * @param userContext - The user context containing authentication and role information
   * @param layout - The layout being viewed
   * @returns true if the user has permission to view the layout
   */
  public canView(userContext: UserContext, layout: IDashboardLayout): boolean {
    if (!userContext.userId) return false;
    if (userContext.role === Role.ADMIN) return true;
    return userContext.userId === layout.userId;
  }

  /**
   * Checks if the user can create a new dashboard layout.
   * Both ADMINs and regular users can create layouts.
   * @param userContext - The user context containing authentication and role information
   * @returns true if the user has permission to create layouts
   */
  public canCreate(userContext: UserContext): boolean {
    if (!userContext.userId) return false;
    return [Role.USER, Role.ADMIN].includes(userContext.role);
  }

  /**
   * Checks if the user can update a specific dashboard layout.
   * ADMINs can update any layout.
   * Regular users can only update their own layouts.
   * @param userContext - The user context containing authentication and role information
   * @param layout - The layout being updated
   * @returns true if the user has permission to update the layout
   */
  public canUpdate(userContext: UserContext, layout: IDashboardLayout): boolean {
    if (!userContext.userId) return false;
    if (userContext.role === Role.ADMIN) return true;
    return userContext.userId === layout.userId;
  }

  /**
   * Checks if the user can delete a specific dashboard layout.
   * ADMINs can delete any layout.
   * Regular users can only delete their own layouts.
   * @param userContext - The user context containing authentication and role information
   * @param layout - The layout being deleted
   * @returns true if the user has permission to delete the layout
   */
  public canDelete(userContext: UserContext, layout: IDashboardLayout): boolean {
    if (!userContext.userId) return false;
    if (userContext.role === Role.ADMIN) return true;
    return userContext.userId === layout.userId;
  }

  // Add other specific policy checks if needed, e.g., deleting a layout
  // async canDelete(currentUser: AuthenticatedUser, layout: DashboardLayout): Promise<boolean> {
  //   if (!currentUser || !layout) return false;
  //   if (currentUser.role === Role.ADMIN) return true;
  //   return currentUser.id === layout.userId;
  // }
} 