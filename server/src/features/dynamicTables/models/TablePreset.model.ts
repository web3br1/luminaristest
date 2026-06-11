import type { IDynamicTable } from './DynamicTable.model';

/**
 * Defines the structure of a full preset, including its metadata and tables.
 */
export interface IPreset {
  /**
   * A unique key for the preset (e.g., 'beauty_salon_advanced').
   */
  key: string;

  /**
   * The display name of the preset.
   */
  name: string;

  /**
   * A short description of what the preset is for.
   */
  description: string;

  /**
   * The category the preset belongs to (e.g., 'Beauty & Wellness').
   */
  category: string;

  /**
   * A record of all tables included in this preset, indexed by a unique key.
   */
  tables: Record<string, IDynamicTable>;
}
