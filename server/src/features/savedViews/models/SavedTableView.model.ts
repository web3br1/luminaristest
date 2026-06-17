/**
 * Sort configuration for a saved table view — mirrors the GenericTabbedView
 * `SortOption` shape ({ field, direction }).
 */
export interface SavedViewSortConfig {
  field: string;
  direction: 'asc' | 'desc';
}

/**
 * Persisted configuration of a saved table view. Flexible by design so column
 * config (currently localStorage-only) can be folded in later without a schema
 * change. All fields optional — a view may persist only a query, only filters, etc.
 */
export interface SavedTableViewConfig {
  /** Free-text search query applied to the table. */
  query?: string;
  /** Per-field filter values keyed by field name. */
  fieldFilters?: Record<string, string>;
  /** Active sort, or null when sorting is cleared. */
  sortConfig?: SavedViewSortConfig | null;
}

/**
 * Core SavedTableView domain entity. Decouples application logic from Prisma.
 */
export interface ISavedTableView {
  /** Unique identifier for the saved view. */
  id: string;
  /** ID of the user who owns this view. */
  userId: string;
  /** IDynamicTable.id this view is scoped to. */
  tableId: string;
  /** Display name of the saved view. */
  name: string;
  /** Persisted view configuration (query/filters/sort). */
  config: SavedTableViewConfig;
  /** Timestamp when the view was created. */
  createdAt: Date;
  /** Timestamp when the view was last updated. */
  updatedAt: Date;
}

/** Input shape for creating a saved view (userId injected by the service). */
export interface CreateSavedTableViewInput {
  userId: string;
  tableId: string;
  name: string;
  config: SavedTableViewConfig;
}

/** Input shape for partially updating a saved view. */
export interface UpdateSavedTableViewInput {
  tableId?: string;
  name?: string;
  config?: SavedTableViewConfig;
}
