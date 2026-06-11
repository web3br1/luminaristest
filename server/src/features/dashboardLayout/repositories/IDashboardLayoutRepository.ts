import { Prisma } from 'generated/prisma';
import { IDashboardLayout, IDashboardLayoutSummary, LayoutType } from '../models/DashboardLayout.model';
import { CreateDashboardLayoutDto, UpdateDashboardLayoutDto } from '../dtos/DashboardLayoutDto';

/**
 * Interface defining the contract for DashboardLayout data access operations.
 * All methods should handle data access and transformation consistently.
 */
export interface IDashboardLayoutRepository {
  /**
   * Creates a new dashboard layout in the database.
   * @param data - Layout creation data
   * @returns The created layout with all fields
   */
  createLayout(data: Prisma.DashboardLayoutCreateInput): Promise<Prisma.DashboardLayoutGetPayload<{}>>;

  /**
   * Retrieves a paginated list of dashboard layouts.
   * @param page - Page number (1-based)
   * @param limit - Number of items per page
   * @returns Object containing layouts array and total count
   */
  getAllLayouts(page?: number, limit?: number): Promise<{
    layouts: IDashboardLayoutSummary[];
    totalCount: number;
  }>;

  /**
   * Retrieves a dashboard layout by its ID.
   * @param id - Layout ID
   * @returns Layout or null if not found
   */
  getLayoutById(id: string): Promise<IDashboardLayout | null>;

  /**
   * Retrieves all layouts for a specific user.
   * @param userId - User ID
   * @returns Array of layouts
   */
  getLayoutsByUser(userId: string): Promise<IDashboardLayout[]>;

  /**
   * Updates a dashboard layout's information.
   * @param id - Layout ID
   * @param data - Update data
   * @returns Updated layout
   */
  updateLayout(id: string, data: Prisma.DashboardLayoutUpdateInput): Promise<IDashboardLayout>;

  /**
   * Deletes a dashboard layout from the database.
   * @param id - Layout ID
   * @returns The deleted layout
   */
  deleteLayout(id: string): Promise<Prisma.DashboardLayoutGetPayload<{}>>;
} 