import {
  ISavedTableView,
  CreateSavedTableViewInput,
  UpdateSavedTableViewInput,
} from '../models/SavedTableView.model';

/**
 * Contract for SavedTableView data access. All reads filter soft-deleted rows.
 */
export interface ISavedTableViewRepository {
  /**
   * Creates a new saved table view.
   * @param data - Creation input (userId, tableId, name, config)
   * @returns The created view
   */
  create(data: CreateSavedTableViewInput): Promise<ISavedTableView>;

  /**
   * Lists a user's saved views for a specific table (newest first).
   * @param userId - Owner user ID
   * @param tableId - IDynamicTable.id scope
   * @returns Array of saved views
   */
  findManyByUserAndTable(userId: string, tableId: string): Promise<ISavedTableView[]>;

  /**
   * Finds a saved view by ID (soft-deleted excluded).
   * @param id - View ID
   * @returns View or null
   */
  findById(id: string): Promise<ISavedTableView | null>;

  /**
   * Updates a saved view's mutable fields.
   * @param id - View ID
   * @param data - Partial update input
   * @returns Updated view
   */
  update(id: string, data: UpdateSavedTableViewInput): Promise<ISavedTableView>;

  /**
   * Soft-deletes a saved view (sets deletedAt).
   * @param id - View ID
   */
  softDelete(id: string): Promise<void>;
}
