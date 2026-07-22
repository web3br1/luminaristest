import { UserContext } from '../../../types/UserContext';
import type { IDashboardLayoutPolicy } from '../policies/IDashboardLayoutPolicy';
import type { IDashboardLayoutRepository } from '../repositories/IDashboardLayoutRepository';
import {
  CreateDashboardLayoutDto,
  UpdateDashboardLayoutDto,
  DashboardLayoutDto,
} from '../dtos/DashboardLayoutDto';
import { ForbiddenError, NotFoundError, UnauthorizedError, ValidationError } from '../../../lib/errors';
import { IDashboardLayout } from '../models/DashboardLayout.model';
import type { Prisma } from 'generated/prisma';

/** Maximum number of layouts (tabs) a single user may own. */
const MAX_LAYOUTS_PER_USER = 20;

/**
 * Service responsible for dashboard layout (tab) business logic.
 * A user can own multiple layouts; at most one is active at a time.
 */
export class DashboardLayoutService {
  constructor(
    private dashboardLayoutRepository: IDashboardLayoutRepository,
    private dashboardLayoutPolicy: IDashboardLayoutPolicy
  ) {}

  /**
   * Creates a new dashboard layout (tab) and makes it the active one.
   * @throws {UnauthorizedError} If user is not authenticated
   * @throws {ForbiddenError} If the user cannot create layouts
   * @throws {ValidationError} If the user reached the maximum number of layouts
   */
  public async createLayout(data: CreateDashboardLayoutDto, userContext: UserContext): Promise<DashboardLayoutDto> {
    if (!userContext.userId) {
      throw new UnauthorizedError('Authentication required to create layout');
    }
    if (!this.dashboardLayoutPolicy.canCreate(userContext)) {
      throw new ForbiddenError('User not permitted to create layout');
    }

    // Bound the number of tabs per user so the (unpaginated) list stays small.
    const count = await this.dashboardLayoutRepository.countByUser(userContext.userId);
    if (count >= MAX_LAYOUTS_PER_USER) {
      throw new ValidationError(`Maximum of ${MAX_LAYOUTS_PER_USER} dashboards reached`);
    }

    const created = await this.dashboardLayoutRepository.createLayout({
      name: data.name,
      layoutData: { type: data.type, config: data.config } as unknown as Prisma.InputJsonValue,
      user: { connect: { id: userContext.userId } },
    });

    // A newly created tab becomes the active one.
    await this.dashboardLayoutRepository.setActive(userContext.userId, created.id);
    return this.mapToDto({ ...created, isActive: true });
  }

  /**
   * Retrieves all layouts (tabs) owned by the current user.
   * @throws {UnauthorizedError} If user is not authenticated
   */
  public async getLayoutsByUser(userContext: UserContext): Promise<DashboardLayoutDto[]> {
    if (!userContext.userId) {
      throw new UnauthorizedError('Authentication required to list layouts');
    }

    const layouts = await this.dashboardLayoutRepository.getLayoutsByUser(userContext.userId);
    return layouts.map(layout => this.mapToDto(layout));
  }

  /**
   * Retrieves a dashboard layout by ID (owner only).
   * @throws {UnauthorizedError} If user is not authenticated
   * @throws {NotFoundError} If layout not found
   * @throws {ForbiddenError} If the layout does not belong to the user
   */
  public async getLayoutById(id: string, userContext: UserContext): Promise<DashboardLayoutDto> {
    if (!userContext.userId) {
      throw new UnauthorizedError('Authentication required to view layout');
    }

    const layout = await this.dashboardLayoutRepository.getLayoutById(id);
    if (!layout) {
      throw new NotFoundError('Layout not found');
    }
    if (!this.dashboardLayoutPolicy.canView(userContext, layout)) {
      throw new ForbiddenError('User not permitted to view this layout');
    }

    return this.mapToDto(layout);
  }

  /**
   * Updates a layout. Partial updates are merged with the existing record so a
   * field-level update never wipes the rest of the layout.
   * @throws {UnauthorizedError} If user is not authenticated
   * @throws {NotFoundError} If layout not found
   * @throws {ForbiddenError} If the layout does not belong to the user
   */
  public async updateLayout(id: string, data: UpdateDashboardLayoutDto, userContext: UserContext): Promise<DashboardLayoutDto> {
    if (!userContext.userId) {
      throw new UnauthorizedError('Authentication required to update layout');
    }

    const layout = await this.dashboardLayoutRepository.getLayoutById(id);
    if (!layout) {
      throw new NotFoundError('Layout not found');
    }
    if (!this.dashboardLayoutPolicy.canUpdate(userContext, layout)) {
      throw new ForbiddenError('User not permitted to update this layout');
    }

    const updateData: Prisma.DashboardLayoutUpdateInput = {
      // Merge with the current record: undefined fields keep their stored value.
      layoutData: {
        type: data.type ?? layout.type,
        config: data.config ?? layout.config,
      } as unknown as Prisma.InputJsonValue,
    };
    if (data.name !== undefined) {
      updateData.name = data.name;
    }

    const updated = await this.dashboardLayoutRepository.updateLayout(id, updateData);
    return this.mapToDto(updated);
  }

  /**
   * Makes a layout (tab) the user's active one.
   * @throws {UnauthorizedError} If user is not authenticated
   * @throws {NotFoundError} If layout not found
   * @throws {ForbiddenError} If the layout does not belong to the user
   */
  public async setActiveLayout(id: string, userContext: UserContext): Promise<DashboardLayoutDto> {
    if (!userContext.userId) {
      throw new UnauthorizedError('Authentication required to switch layout');
    }

    const layout = await this.dashboardLayoutRepository.getLayoutById(id);
    if (!layout) {
      throw new NotFoundError('Layout not found');
    }
    if (!this.dashboardLayoutPolicy.canUpdate(userContext, layout)) {
      throw new ForbiddenError('User not permitted to switch to this layout');
    }

    await this.dashboardLayoutRepository.setActive(userContext.userId, id);
    return this.mapToDto({ ...layout, isActive: true });
  }

  /**
   * Deletes a layout (tab). If the deleted layout was active, the most recently
   * updated remaining layout becomes active.
   * @throws {UnauthorizedError} If user is not authenticated
   * @throws {NotFoundError} If layout not found
   * @throws {ForbiddenError} If the layout does not belong to the user
   */
  public async deleteLayout(id: string, userContext: UserContext): Promise<void> {
    if (!userContext.userId) {
      throw new UnauthorizedError('Authentication required to delete layout');
    }

    const layout = await this.dashboardLayoutRepository.getLayoutById(id);
    if (!layout) {
      throw new NotFoundError('Layout not found');
    }
    if (!this.dashboardLayoutPolicy.canDelete(userContext, layout)) {
      throw new ForbiddenError('User not permitted to delete this layout');
    }

    await this.dashboardLayoutRepository.deleteLayout(id);

    // Keep one active tab: promote the most recent remaining layout if we deleted the active one.
    if (layout.isActive) {
      const remaining = await this.dashboardLayoutRepository.getLayoutsByUser(userContext.userId);
      if (remaining.length > 0) {
        await this.dashboardLayoutRepository.setActive(userContext.userId, remaining[0].id);
      }
    }
  }

  /**
   * Maps a domain layout to its DTO.
   */
  private mapToDto(layout: IDashboardLayout): DashboardLayoutDto {
    return {
      id: layout.id,
      userId: layout.userId,
      name: layout.name,
      isActive: layout.isActive,
      type: layout.type,
      config: layout.config,
      createdAt: layout.createdAt,
      updatedAt: layout.updatedAt,
    };
  }
}
