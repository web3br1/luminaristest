import prisma from '../../../lib/prisma';
import { logger } from '@/lib/logger';
import { ServiceError } from '@/lib/errors';
import { Prisma } from 'generated/prisma';
import { IDashboardLayout, LayoutType, LayoutConfig } from '../models/DashboardLayout.model';
import { IDashboardLayoutRepository } from './IDashboardLayoutRepository';

// Columns selected for a full layout (name/isActive are columns; type/config live in layoutData).
const FULL_SELECT = {
  id: true,
  userId: true,
  name: true,
  isActive: true,
  layoutData: true,
  createdAt: true,
  updatedAt: true,
} as const;

/**
 * Repository implementation for DashboardLayout data access operations.
 * Handles all database interactions for the DashboardLayout entity.
 */
export class DashboardLayoutRepository implements IDashboardLayoutRepository {

  /**
   * Converts a stored layout type string to the domain LayoutType.
   */
  private convertLayoutType(prismaType: string): LayoutType {
    return prismaType as LayoutType;
  }

  /**
   * Creates a new dashboard layout in the database.
   */
  public async createLayout(data: Prisma.DashboardLayoutCreateInput): Promise<IDashboardLayout> {
    const layout = await prisma.dashboardLayout.create({ data, select: FULL_SELECT });
    return this.mapToDomain(layout);
  }

  /**
   * Retrieves a dashboard layout by its ID.
   */
  public async getLayoutById(id: string): Promise<IDashboardLayout | null> {
    const layout = await prisma.dashboardLayout.findUnique({ where: { id }, select: FULL_SELECT });
    if (!layout) return null;
    return this.mapToDomain(layout);
  }

  /**
   * Retrieves all layouts (tabs) for a specific user, most recently updated first.
   */
  public async getLayoutsByUser(userId: string): Promise<IDashboardLayout[]> {
    const layouts = await prisma.dashboardLayout.findMany({
      where: { userId },
      select: FULL_SELECT,
      orderBy: { updatedAt: 'desc' },
    });
    // Fail-soft: a single malformed row must not deny the user access to all their tabs.
    // (Single-record reads still surface the error via mapToDomain.)
    return layouts.reduce<IDashboardLayout[]>((acc, row) => {
      try {
        acc.push(this.mapToDomain(row));
      } catch (error) {
        logger.warn('Skipping malformed dashboard layout row', { layoutId: row.id, error });
      }
      return acc;
    }, []);
  }

  /**
   * Counts how many layouts (tabs) a user owns.
   */
  public async countByUser(userId: string): Promise<number> {
    return prisma.dashboardLayout.count({ where: { userId } });
  }

  /**
   * Updates a dashboard layout's information.
   */
  public async updateLayout(id: string, data: Prisma.DashboardLayoutUpdateInput): Promise<IDashboardLayout> {
    const layout = await prisma.dashboardLayout.update({ where: { id }, data, select: FULL_SELECT });
    return this.mapToDomain(layout);
  }

  /**
   * Atomically makes `layoutId` the user's single active layout (tab).
   */
  public async setActive(userId: string, layoutId: string): Promise<void> {
    await prisma.$transaction([
      prisma.dashboardLayout.updateMany({ where: { userId, isActive: true }, data: { isActive: false } }),
      // Scoped by userId as well so the method is self-guarding against cross-tenant ids.
      prisma.dashboardLayout.updateMany({ where: { id: layoutId, userId }, data: { isActive: true } }),
    ]);
  }

  /**
   * Deletes a dashboard layout from the database.
   */
  public async deleteLayout(id: string): Promise<void> {
    await prisma.dashboardLayout.delete({ where: { id } });
  }

  /**
   * Maps a persisted row to the domain entity (name/isActive from columns, type/config from JSON).
   */
  private mapToDomain = (layout: {
    id: string;
    userId: string;
    name: string;
    isActive: boolean;
    layoutData: Prisma.JsonValue;
    createdAt: Date;
    updatedAt: Date;
  }): IDashboardLayout => {
    const data = layout.layoutData as { type?: string; config?: LayoutConfig } | null;

    if (!data || !data.type) {
      logger.error('Invalid layout data: missing type', { layoutId: layout.id });
      throw new ServiceError('Invalid layout data: type is missing');
    }

    return {
      id: layout.id,
      userId: layout.userId,
      name: layout.name,
      isActive: layout.isActive,
      type: this.convertLayoutType(data.type),
      config: data.config ?? { columns: 1, widgets: [] },
      createdAt: layout.createdAt,
      updatedAt: layout.updatedAt,
    };
  };
}
