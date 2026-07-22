/**
 * Enum defining the available layout types for dashboards.
 * This is the source of truth for layout types in the domain.
 */
export enum LayoutType {
  GRID = 'GRID',
  LIST = 'LIST',
  CUSTOM = 'CUSTOM'
}

/**
 * Represents the core DashboardLayout entity within the application domain.
 * This interface decouples the application logic from the specific ORM (Prisma).
 */
export interface IDashboardLayout {
  /** Unique identifier for the layout */
  id: string;
  /** ID of the user who owns this layout */
  userId: string;
  /** Display name of the layout (tab label) */
  name: string;
  /** Whether this is the user's currently active layout (tab) */
  isActive: boolean;
  /** Type of layout (GRID, LIST, or CUSTOM) */
  type: LayoutType;
  /** Configuration object containing layout-specific settings */
  config: LayoutConfig;
  /** Timestamp when the layout was created */
  createdAt: Date;
  /** Timestamp when the layout was last updated */
  updatedAt: Date;
}

/**
 * Interface defining the configuration for a dashboard layout.
 * Contains all settings needed to render the layout correctly.
 */
export interface LayoutConfig {
  /** Number of columns in the grid layout */
  columns: number;
  /** Array of widget IDs to be displayed in the layout */
  widgets: string[];
  /** Optional array of widget positions and dimensions */
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
    /** Optional per-widget configuration carried opaquely in the layout JSON */
    widgetConfig?: unknown;
  }>;
  /** Optional theme identifier for styling */
  theme?: string;
  /** Optional custom settings specific to the layout type */
  customSettings?: Record<string, unknown>;
} 