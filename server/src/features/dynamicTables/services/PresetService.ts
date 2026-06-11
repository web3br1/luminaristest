import { tablePresetSuites } from '../presets';

/**
 * Service class for handling business logic related to dashboard presets.
 * It centralizes access to presets, ensuring a single source of truth and easy maintenance.
 */
class PresetService {
  /**
   * Retrieves a summary list of all available presets, suitable for UI display.
   * @returns An array of preset summaries.
   */
  public getAllPresetSummaries() {
    const allPresets = Object.values(tablePresetSuites)
      .flatMap(category => Object.values(category))
      .map(preset => ({
        key: preset.key,
        name: preset.name,
        description: preset.description,
        category: this.findCategoryForPreset(preset.key),
      }));

    return allPresets;
  }

  /**
   * Retrieves the full data for a single preset by its key.
   * @param presetKey The unique key of the preset.
   * @returns The full preset object, or null if not found.
   */
  public getPresetByKey(presetKey: string) {
    for (const category of Object.values(tablePresetSuites)) {
      for (const preset of Object.values(category)) {
        if (preset.key === presetKey) {
          return preset;
        }
      }
    }
    return null;
  }

  /**
   * Finds the category key for a given preset key.
   * @param presetKey The key of the preset to find the category for.
   * @returns The category key as a string, or null if not found.
   */
  private findCategoryForPreset(presetKey: string): string | null {
    for (const [categoryKey, category] of Object.entries(tablePresetSuites)) {
      if (Object.values(category).some(p => p.key === presetKey)) {
        return categoryKey;
      }
    }
    return null;
  }
}

// Export a singleton instance of the service
export const presetService = new PresetService();
