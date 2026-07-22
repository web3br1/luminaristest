import { Prisma } from 'generated/prisma';
import { IDashboardLayout } from '../models/DashboardLayout.model';

/**
 * Interface defining the contract for DashboardLayout data access operations.
 */
export interface IDashboardLayoutRepository {
  /**
   * Creates a new dashboard layout (tab) in the database.
   */
  createLayout(data: Prisma.DashboardLayoutCreateInput): Promise<IDashboardLayout>;

  /**
   * Retrieves a dashboard layout by its ID.
   * @returns Layout or null if not found
   */
  getLayoutById(id: string): Promise<IDashboardLayout | null>;

  /**
   * Retrieves all layouts (tabs) for a specific user, most recently updated first.
   */
  getLayoutsByUser(userId: string): Promise<IDashboardLayout[]>;

  /**
   * Counts how many layouts (tabs) a user owns.
   */
  countByUser(userId: string): Promise<number>;

  /**
   * Updates a dashboard layout's information.
   */
  updateLayout(id: string, data: Prisma.DashboardLayoutUpdateInput): Promise<IDashboardLayout>;

  /**
   * Atomically makes `layoutId` the user's single active layout (tab).
   */
  setActive(userId: string, layoutId: string): Promise<void>;

  /**
   * Deletes a dashboard layout from the database.
   */
  deleteLayout(id: string): Promise<void>;
}
