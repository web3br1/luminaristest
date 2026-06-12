import { UserContext } from '../../../types/UserContext';
import type { IDashboardLayoutPolicy } from '../policies/IDashboardLayoutPolicy';
import type { IDashboardLayoutRepository } from '../repositories/IDashboardLayoutRepository';
import { LayoutType } from '../models/DashboardLayout.model';
import { 
  CreateDashboardLayoutDto, 
  UpdateDashboardLayoutDto, 
  DashboardLayoutDto, 
  DashboardLayoutSummaryDto,
  isCreateDashboardLayoutDto,
  isUpdateDashboardLayoutDto
} from '../dtos/DashboardLayoutDto';
import { ServiceError, ForbiddenError, NotFoundError, UnauthorizedError, ValidationError } from '../../../lib/errors';
import { IDashboardLayout, IDashboardLayoutSummary } from '../models/DashboardLayout.model';
import { Prisma } from 'generated/prisma';

/**
 * Service responsible for dashboard layout business logic.
 */
export class DashboardLayoutService {
  constructor(
    private dashboardLayoutRepository: IDashboardLayoutRepository,
    private dashboardLayoutPolicy: IDashboardLayoutPolicy
  ) {}

  /**
   * Creates a new dashboard layout.
   * @param data - Layout creation data
   * @param userContext - User context
   * @returns Created layout
   */
  public async createLayout(
    data: CreateDashboardLayoutDto,
    userContext: UserContext
  ): Promise<DashboardLayoutDto> {
    if (!userContext.userId) {
      throw new UnauthorizedError('Authentication required to create layout');
    }

    try {
      // Valida os dados de entrada
      if (!data.name || !data.type || !data.config) {
        throw new ValidationError('Missing required fields: name, type, and config are required');
      }

      // Verifica se o usuário tem permissão para criar layouts
      if (!this.dashboardLayoutPolicy.canCreate(userContext)) {
        throw new ForbiddenError('User not permitted to create layout');
      }

      // Verifica se já existe um layout para este usuário
      const existingLayouts = await this.dashboardLayoutRepository.getLayoutsByUser(userContext.userId);
      
      // Se já existir um layout, atualiza em vez de criar um novo
      if (existingLayouts && existingLayouts.length > 0) {
        const existingLayout = existingLayouts[0];
        const updatedLayout = await this.dashboardLayoutRepository.updateLayout(existingLayout.id, {
          layoutData: {
            name: data.name,
            type: data.type,
            config: data.config
          } as Prisma.InputJsonValue,
        });
        
        return this.mapToDto(updatedLayout);
      }

      // Cria um novo layout
      const layoutData = {
        name: data.name,
        type: data.type,
        config: data.config,
      };

      const layout = await this.dashboardLayoutRepository.createLayout({
        user: {
          connect: {
            id: userContext.userId
          }
        },
        layoutData: layoutData as Prisma.InputJsonValue,
      });

      // Obtém o layout criado com o mapeamento de domínio
      const createdLayout = await this.dashboardLayoutRepository.getLayoutById(layout.id);
      if (!createdLayout) {
        throw new ServiceError('Falha ao recuperar o layout criado');
      }

      return this.mapToDto(createdLayout);
    } catch (error) {
      console.error('Erro ao criar/atualizar layout:', error);
      if (error instanceof ValidationError || error instanceof ForbiddenError) {
        throw error;
      }
      throw new ServiceError(`Falha ao criar/atualizar layout: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
    }
  }

  /**
   * Retrieves a paginated list of dashboard layouts.
   * @param page - Page number
   * @param limit - Items per page
   * @param userContext - User context
   * @returns List of layouts
   */
  public async getAllLayouts(
    page: number = 1,
    limit: number = 10,
    userContext: UserContext
  ): Promise<DashboardLayoutSummaryDto[]> {
    if (!userContext.userId) {
      throw new UnauthorizedError('Authentication required to list layouts');
    }

    if (!this.dashboardLayoutPolicy.canListAll(userContext)) {
      throw new ForbiddenError('User not permitted to list layouts');
    }

    try {
      const { layouts } = await this.dashboardLayoutRepository.getAllLayouts(page, limit);
      return layouts.map(this.mapToSummaryDto);
    } catch (error) {
      throw new ServiceError('Failed to list layouts');
    }
  }

  /**
   * Retrieves a dashboard layout by ID.
   * @param id - Layout ID
   * @param userContext - User context
   * @returns Layout
   */
  public async getLayoutById(
    id: string,
    userContext: UserContext
  ): Promise<DashboardLayoutDto> {
    if (!userContext.userId) {
      throw new UnauthorizedError('Authentication required to view layout');
    }

    try {
      const layout = await this.dashboardLayoutRepository.getLayoutById(id);
      if (!layout) {
        throw new NotFoundError('Layout not found');
      }

      if (!this.dashboardLayoutPolicy.canView(userContext, layout)) {
        throw new ForbiddenError('User not permitted to view this layout');
      }

      return this.mapToDto(layout);
    } catch (error) {
      if (error instanceof NotFoundError || error instanceof ForbiddenError) {
        throw error;
      }
      throw new ServiceError('Failed to get layout');
    }
  }

  /**
   * Retrieves all layouts for the current user.
   * @param userContext - User context
   * @returns List of layouts
   */
  public async getLayoutsByUser(
    userContext: UserContext
  ): Promise<DashboardLayoutDto[]> {
    if (!userContext.userId) {
      throw new UnauthorizedError('Authentication required to list layouts');
    }

    try {
      const layouts = await this.dashboardLayoutRepository.getLayoutsByUser(userContext.userId);
      
      // Verifica se o layout é válido
      const validLayouts = layouts.filter(layout => {
        try {
          // Verifica se o layout tem os campos obrigatórios
          const hasRequiredFields = 
            layout && 
            typeof layout === 'object' &&
            'id' in layout &&
            'userId' in layout &&
            'name' in layout &&
            'type' in layout &&
            'config' in layout;
            
          if (!hasRequiredFields) {
            console.warn('Layout inválido: faltando campos obrigatórios', layout);
            return false;
          }
          
          // Verifica se o tipo do layout é válido
          const isValidType = Object.values(LayoutType).includes(layout.type as LayoutType);
          if (!isValidType) {
            console.warn(`Tipo de layout inválido: ${layout.type}`, layout);
            return false;
          }
          
          return true;
        } catch (error) {
          console.error('Erro ao validar layout:', error, layout);
          return false;
        }
      });
      
      if (validLayouts.length === 0) {
        console.log('Nenhum layout válido encontrado para o usuário:', userContext.userId);
        // Retorna um layout padrão se não houver layouts válidos
        return [];
      }
      
      return validLayouts.map(this.mapToDto);
    } catch (error) {
      console.error('Erro em getLayoutsByUser:', error);
      throw new ServiceError(`Falha ao listar layouts do usuário: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
    }
  }

  /**
   * Updates a dashboard layout.
   * @param id - Layout ID
   * @param data - Update data
   * @param userContext - User context
   * @returns Updated layout
   */
  public async updateLayout(
    id: string,
    data: UpdateDashboardLayoutDto,
    userContext: UserContext
  ): Promise<DashboardLayoutDto> {
    if (!userContext.userId) {
      throw new UnauthorizedError('Authentication required to update layout');
    }

    if (!isUpdateDashboardLayoutDto(data)) {
      throw new ValidationError('Invalid layout update data');
    }

    try {
      const layout = await this.dashboardLayoutRepository.getLayoutById(id);
      if (!layout) {
        throw new NotFoundError('Layout not found');
      }

      if (!this.dashboardLayoutPolicy.canUpdate(userContext, layout)) {
        throw new ForbiddenError('User not permitted to update this layout');
      }

      // Merge patch onto current domain fields to avoid losing data on partial update
      const updateData: Prisma.DashboardLayoutUpdateInput = {
        layoutData: {
          name: data.name ?? layout.name,
          type: (data.type ?? layout.type) as string,
          config: (data.config ?? layout.config) as unknown as Prisma.InputJsonValue,
        } as Prisma.InputJsonValue,
      };

      const updatedLayout = await this.dashboardLayoutRepository.updateLayout(id, updateData);
      return this.mapToDto(updatedLayout);
    } catch (error) {
      if (error instanceof NotFoundError || error instanceof ForbiddenError) {
        throw error;
      }
      throw new ServiceError('Failed to update layout');
    }
  }

  /**
   * Deletes a dashboard layout.
   * @param id - Layout ID
   * @param userContext - User context
   */
  public async deleteLayout(
    id: string,
    userContext: UserContext
  ): Promise<void> {
    if (!userContext.userId) {
      throw new UnauthorizedError('Authentication required to delete layout');
    }

    try {
      const layout = await this.dashboardLayoutRepository.getLayoutById(id);
      if (!layout) {
        throw new NotFoundError('Layout not found');
      }

      if (!this.dashboardLayoutPolicy.canDelete(userContext, layout)) {
        throw new ForbiddenError('User not permitted to delete this layout');
      }

      await this.dashboardLayoutRepository.deleteLayout(id);
    } catch (error) {
      if (error instanceof NotFoundError || error instanceof ForbiddenError) {
        throw error;
      }
      throw new ServiceError('Failed to delete layout');
    }
  }

  /**
   * Maps a layout to DTO.
   * @param layout - Layout to map
   * @returns DTO
   */
  private mapToDto(layout: IDashboardLayout): DashboardLayoutDto {
    return {
      id: layout.id,
      userId: layout.userId,
      name: layout.name,
      type: layout.type,
      config: layout.config,
      createdAt: layout.createdAt,
      updatedAt: layout.updatedAt,
    };
  }

  /**
   * Maps a layout to summary DTO.
   * @param layout - Layout to map
   * @returns Summary DTO
   */
  private mapToSummaryDto(layout: IDashboardLayoutSummary): DashboardLayoutSummaryDto {
    return {
      id: layout.id,
      userId: layout.userId,
      name: layout.name,
      type: layout.type,
      updatedAt: layout.updatedAt,
    };
  }
} 