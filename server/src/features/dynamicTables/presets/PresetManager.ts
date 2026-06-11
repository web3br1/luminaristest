import { IPreset } from '../models/TablePreset.model';

/**
 * Converts a kebab-case or snake_case key into a PascalCase string.
 * @example 'beauty_salon_preset' -> 'BeautySalonPreset'
 * @param key The string key to convert.
 * @returns The converted PascalCase string.
 */
function keyToPascalCase(key: string): string {
  return key
    .split(/[-_]/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');
}

/**
 * Dynamically loads a preset module based on its key.
 * This function is designed to run on the server-side.
 *
 * @param key The unique key of the preset (e.g., 'beauty_salon').
 * @returns A promise that resolves to the loaded preset object.
 * @throws An error if the preset module cannot be found.
 */
export async function getPresetByKey(key: string): Promise<IPreset> {
  const pascalCaseName = keyToPascalCase(key);
  const fileName = `${pascalCaseName}Preset`; // Convention: BeautySalonPreset.ts

  try {
    // Dynamically import the preset module from the 'systems' directory
    const presetModule = await import(`./systems/${fileName}`);

    // The preset object is expected to be the default export
    const preset: IPreset = presetModule.default;

    if (!preset) {
      throw new Error(`Preset object not found in module: ${fileName}`);
    }

    return preset;
  } catch (error) {
    console.error(`Failed to load preset for key '${key}':`, error);
    throw new Error(`Preset with key '${key}' could not be loaded.`);
  }
}
