import type { IPreset } from '../models/TablePreset.model';

export interface IPresetDependencyMap {
  /**
   * Maps a table to the list of tables that depend on it.
   * @example { 'products': ['productUnits', 'stockMovements'] }
   */
  dependents: Record<string, string[]>;
  /**
   * Maps a table to the list of tables it depends on.
   * @example { 'productUnits': ['products', 'units'] }
   */
  dependencies: Record<string, string[]>;
}

/**
 * Analyzes a preset to map the dependencies between its tables.
 * @param preset The full preset object.
 * @returns An object containing both dependency and dependent maps.
 */
export function analyzePresetDependencies(preset: IPreset): IPresetDependencyMap {
  const dependents: Record<string, string[]> = {};
  const dependencies: Record<string, string[]> = {};

  const tableKeys = Object.keys(preset.tables);

  // Initialize maps for all tables
  for (const tableKey of tableKeys) {
    dependents[tableKey] = [];
    dependencies[tableKey] = [];
  }

  // Analyze relationships
  for (const tableKey of tableKeys) {
    const table = preset.tables[tableKey];
    if (!table.schema || !table.schema.fields) continue;

    for (const field of table.schema.fields) {
      if (field.type === 'relation' && field.relation?.targetTable) {
        const targetTableKey = field.relation.targetTable.replace('@@PRESET_TABLE_KEY::', '');

        if (preset.tables[targetTableKey]) {
          // `tableKey` depends on `targetTableKey`
          if (!dependencies[tableKey].includes(targetTableKey)) {
            dependencies[tableKey].push(targetTableKey);
          }

          // `targetTableKey` is a dependency for `tableKey` (i.e., has a dependent)
          if (!dependents[targetTableKey].includes(tableKey)) {
            dependents[targetTableKey].push(tableKey);
          }
        }
      }
    }
  }

  return { dependents, dependencies };
}
