import { CoreSystemPreset } from './systems/CoreSystemPreset';
import BeautySalonPreset from './systems/BeautySalonPreset';
import CrmModulePreset from './systems/CrmModulePreset';
import { ITableSchema } from '../models/DynamicTable.model';
import type { AnalyticsConfiguration } from '@/features/analytics/core/models/AnalyticsConfiguration';
import { DynamicTableCategory } from '../models/TableCategories';

/**
 * The core system preset that is installed for every user.
 * It is exported separately as it is not a user-selectable option.
 */
export { CoreSystemPreset };

/**
 * A centralized object containing all available table preset suites, organized by category.
 * Each suite represents a complete, interconnected set of tables for a specific business type.
 * This makes it easy for the AI service to discover and use predefined, complex schemas.
 */
export const tablePresetSuites = {
  services: {
    beautySalon: BeautySalonPreset,
  },
  sales: {
    crmModule: CrmModulePreset,
  },
};

// --- Utility Types for Working with Presets ---

// Type for a single table definition within a suite
export type PresetTableDefinition = {
  name: string;
  category: DynamicTableCategory;
  schema: ITableSchema;
  meta?: {
    /**
     * Lista de chaves de tabelas do mesmo preset que são obrigatórias
     * quando esta tabela estiver presente.
     */
    requiresTables?: string[];
    /**
     * Lista de chaves de tabelas que não podem coexistir com esta tabela.
     */
    excludesTables?: string[];
    /**
     * Capacidades que esta tabela fornece (ex.: 'inventory.stock').
     */
    providesCapabilities?: string[];
    /**
     * Capacidades necessárias para esta tabela operar (ex.: 'inventory.movements').
     */
    requiresCapabilities?: string[];
  };
  /**
   * Optional analytics configurations integrated at the table level.
   * These will be merged with system preset analytics.
   */
  analytics?: AnalyticsConfiguration[];
};

// Type for a full preset suite.
// Identity fields are all optional — `BeautySalonPreset` uses `key/name/description`,
// older suites used `suiteName`. The only required field is `tables`.
export type PresetSuite = {
  tables: Record<string, PresetTableDefinition>;
  key?: string;
  name?: string;
  description?: string;
  /** @deprecated Use `name`. Kept for backward compatibility with older suites. */
  suiteName?: string;
};

export type PresetSuiteCategory = keyof typeof tablePresetSuites;
export type PresetSuiteName<T extends PresetSuiteCategory> = keyof (typeof tablePresetSuites)[T];

