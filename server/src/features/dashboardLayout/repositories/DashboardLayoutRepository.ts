import prisma from '../../../lib/prisma';
import { Prisma } from 'generated/prisma';
import { IDashboardLayout, IDashboardLayoutSummary, LayoutType } from '../models/DashboardLayout.model';
import { IDashboardLayoutRepository } from './IDashboardLayoutRepository';

/**
 * Repository implementation for DashboardLayout data access operations.
 * Handles all database interactions for the DashboardLayout entity.
 */
export class DashboardLayoutRepository implements IDashboardLayoutRepository {

  /**
   * Converts Prisma LayoutType to domain LayoutType
   */
  private convertLayoutType(prismaType: string): LayoutType {
    return prismaType as LayoutType;
  }

  /**
   * Creates a new dashboard layout in the database.
   * @param data - Layout creation data
   * @returns The created layout with all fields
   */
  public async createLayout(data: Prisma.DashboardLayoutCreateInput): Promise<Prisma.DashboardLayoutGetPayload<{}>> {
    return prisma.dashboardLayout.create({
      data,
      select: {
        id: true,
        userId: true,
        layoutData: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  /**
   * Retrieves a paginated list of dashboard layouts.
   * @param page - Page number (1-based)
   * @param limit - Number of items per page
   * @returns Object containing layouts array and total count
   */
  public async getAllLayouts(page: number = 1, limit: number = 10): Promise<{
    layouts: IDashboardLayoutSummary[];
    totalCount: number;
  }> {
    const skip = (page - 1) * limit;
    const take = limit;

    const [layouts, totalCount] = await prisma.$transaction([
      prisma.dashboardLayout.findMany({
        skip,
        take,
        select: {
          id: true,
          userId: true,
          layoutData: true,
          updatedAt: true,
        },
        orderBy: {
          updatedAt: 'desc', // Default ordering
        },
      }),
      prisma.dashboardLayout.count(),
    ]);

    return {
      layouts: layouts.map(this.mapToSummary),
      totalCount,
    };
  }

  /**
   * Retrieves a dashboard layout by its ID.
   * @param id - Layout ID
   * @returns Layout or null if not found
   */
  public async getLayoutById(id: string): Promise<IDashboardLayout | null> {
    const layout = await prisma.dashboardLayout.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        layoutData: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!layout) return null;

    return this.mapToDomain(layout);
  }

  /**
   * Retrieves all layouts for a specific user.
   * @param userId - User ID
   * @returns Array of layouts
   */
  public async getLayoutsByUser(userId: string): Promise<IDashboardLayout[]> {
    const layouts = await prisma.dashboardLayout.findMany({
      where: { userId },
      select: {
        id: true,
        userId: true,
        layoutData: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });

    return layouts.map(this.mapToDomain);
  }

  /**
   * Updates a dashboard layout's information.
   * @param id - Layout ID
   * @param data - Update data
   * @returns Updated layout
   */
  public async updateLayout(id: string, data: Prisma.DashboardLayoutUpdateInput): Promise<IDashboardLayout> {
    const layout = await prisma.dashboardLayout.update({
      where: { id },
      data,
      select: {
        id: true,
        userId: true,
        layoutData: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return this.mapToDomain(layout);
  }

  /**
   * Deletes a dashboard layout from the database.
   * @param id - Layout ID
   * @returns The deleted layout
   */
  public async deleteLayout(id: string): Promise<Prisma.DashboardLayoutGetPayload<{}>> {
    return prisma.dashboardLayout.delete({
      where: { id },
      select: {
        id: true,
        userId: true,
        layoutData: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  /**
   * Maps a Prisma layout to domain layout
   */
  private mapToDomain = (layout: {
    id: string;
    userId: string;
    layoutData: Prisma.JsonValue;
    createdAt: Date;
    updatedAt: Date;
  }): IDashboardLayout => {
    try {
      const data = layout.layoutData as {
        name: string;
        type: string;
        config: {
          columns: number;
          widgets: string[];
          positions?: Array<{
            id: string;
            i: string;
            x: number;
            y: number;
            w: number;
            h: number;
            minW?: number;
            minH?: number;
            type: string;
          }>;
          theme?: string;
          customSettings?: Record<string, unknown>;
        };
      };

      // Verifica se os dados necessários estão presentes
      if (!data || !data.type) {
        console.error('Dados de layout inválidos:', { layout, data });
        throw new Error('Dados de layout inválidos: tipo não especificado');
      }

      // Converte o tipo do layout
      const layoutType = this.convertLayoutType(data.type);

      return {
        id: layout.id,
        userId: layout.userId,
        name: data.name || 'Sem nome',
        type: layoutType,
        config: data.config || { columns: 1, widgets: [] },
        createdAt: layout.createdAt,
        updatedAt: layout.updatedAt,
      };
    } catch (error) {
      console.error('Erro ao mapear layout:', error, layout);
      throw new Error(`Falha ao mapear layout: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
    }
  }

  /**
   * Maps a Prisma layout to summary layout
   */
  private mapToSummary = (layout: {
    id: string;
    userId: string;
    layoutData: Prisma.JsonValue;
    updatedAt: Date;
  }): IDashboardLayoutSummary => {
    try {
      const data = layout.layoutData as {
        name: string;
        type: string;
      };

      // Verifica se os dados necessários estão presentes
      if (!data || !data.type) {
        console.error('Dados de resumo de layout inválidos:', { layout, data });
        throw new Error('Dados de resumo de layout inválidos: tipo não especificado');
      }

      // Converte o tipo do layout
      const layoutType = this.convertLayoutType(data.type);

      return {
        id: layout.id,
        userId: layout.userId,
        name: data.name || 'Sem nome',
        type: layoutType,
        updatedAt: layout.updatedAt,
      };
    } catch (error) {
      console.error('Erro ao mapear resumo do layout:', error, layout);
      throw new Error(`Falha ao mapear resumo do layout: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
    }
  }
}