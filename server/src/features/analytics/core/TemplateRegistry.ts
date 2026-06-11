/**
 * Analytics Template Registry
 *
 * Central registry for all analytics templates (both dynamic and KPI-specific).
 * Templates define the structure and requirements for analytics configurations.
 */

import type { AnalyticsTemplate } from './models/AnalyticsTemplate';

// =============================================================================
// REGISTRY
// =============================================================================

/**
 * Registry of all available analytics templates.
 */
const templateRegistry: Record<string, AnalyticsTemplate> = {};

/**
 * Register an analytics template.
 *
 * @param template The template to register
 */
export function registerTemplate(template: AnalyticsTemplate): void {
  if (templateRegistry[template.key]) {
    console.warn(`[Analytics] Template '${template.key}' already registered. Overwriting.`);
  }
  templateRegistry[template.key] = template;
}

/**
 * Get a template by key.
 *
 * @param key The template key
 * @returns The template or null if not found
 */
export function getTemplate(key: string): AnalyticsTemplate | null {
  return templateRegistry[key] || null;
}

/**
 * Get all registered templates.
 *
 * @returns Array of all registered templates
 */
export function getAllTemplates(): AnalyticsTemplate[] {
  return Object.values(templateRegistry);
}

/**
 * Get all registered template keys.
 *
 * @returns Array of registered template keys
 */
export function getRegisteredTemplateKeys(): string[] {
  return Object.keys(templateRegistry);
}

/**
 * Check if a template is registered.
 *
 * @param key The template key
 * @returns True if registered
 */
export function hasTemplate(key: string): boolean {
  return key in templateRegistry;
}

/**
 * Export the registry for direct access (read-only).
 */
export { templateRegistry };

