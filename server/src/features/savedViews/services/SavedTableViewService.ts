import type { IUser } from '../../users/models/User.model';
import { Role } from '../../users/models/User.model';
import { ForbiddenError, NotFoundError } from '../../../lib/errors';
import type { ISavedTableViewRepository } from '../repositories/ISavedTableViewRepository';
import type { ISavedTableViewPolicy } from '../policies/ISavedTableViewPolicy';
import { ISavedTableView } from '../models/SavedTableView.model';
import {
  CreateSavedTableViewDto,
  UpdateSavedTableViewDto,
} from '../dtos/SavedTableViewDto';

/**
 * Business logic for per-user saved table views. Views are scoped to the actor;
 * a view belonging to another user is reported as NotFound (no enumeration leak).
 */
export class SavedTableViewService {
  constructor(
    private readonly repository: ISavedTableViewRepository,
    private readonly policy: ISavedTableViewPolicy
  ) {}

  /**
   * Lists the actor's saved views for a table.
   * @param actor - Authenticated user
   * @param tableId - IDynamicTable.id scope
   */
  public async list(actor: IUser, tableId: string): Promise<ISavedTableView[]> {
    return this.repository.findManyByUserAndTable(actor.id, tableId);
  }

  /**
   * Creates a saved view owned by the actor.
   * @param actor - Authenticated user
   * @param dto - Validated create payload
   */
  public async create(actor: IUser, dto: CreateSavedTableViewDto): Promise<ISavedTableView> {
    return this.repository.create({
      userId: actor.id,
      tableId: dto.tableId,
      name: dto.name,
      config: dto.config,
    });
  }

  /**
   * Updates a saved view the actor owns (or any view if ADMIN).
   * Cross-tenant or missing view → NotFoundError.
   * @param actor - Authenticated user
   * @param id - View ID
   * @param patch - Validated partial update
   */
  public async update(
    actor: IUser,
    id: string,
    patch: UpdateSavedTableViewDto
  ): Promise<ISavedTableView> {
    const existing = await this.repository.findById(id);
    const isAdmin = actor.role === Role.ADMIN;
    if (!existing || (existing.userId !== actor.id && !isAdmin)) {
      throw new NotFoundError('Saved view not found');
    }
    if (!this.policy.canUpdate(actor, existing.userId)) {
      throw new ForbiddenError('You do not have permission to update this saved view.');
    }
    return this.repository.update(id, patch);
  }

  /**
   * Soft-deletes a saved view the actor owns (or any view if ADMIN).
   * Cross-tenant or missing view → NotFoundError.
   * @param actor - Authenticated user
   * @param id - View ID
   */
  public async delete(actor: IUser, id: string): Promise<void> {
    const existing = await this.repository.findById(id);
    const isAdmin = actor.role === Role.ADMIN;
    if (!existing || (existing.userId !== actor.id && !isAdmin)) {
      throw new NotFoundError('Saved view not found');
    }
    if (!this.policy.canDelete(actor, existing.userId)) {
      throw new ForbiddenError('You do not have permission to delete this saved view.');
    }
    await this.repository.softDelete(id);
  }
}
