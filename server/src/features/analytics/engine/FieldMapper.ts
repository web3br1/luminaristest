/**
 * Field Mapper
 *
 * Maps analytics configuration field mappings to processor parameters.
 * Combines template defaults, configuration params, and field mappings.
 */

import type { AnalyticsConfiguration } from '../core/models/AnalyticsConfiguration';
import { getTemplate } from '../core';

/**
 * Maps an analytics configuration to processor parameters.
 * Combines:
 * 1. Template default params
 * 2. Configuration params
 * 3. Field mappings (converted to processor params)
 *
 * @param config The analytics configuration
 * @returns Parameters object to pass to the processor
 */
export function mapConfigurationToProcessorParams(
  config: AnalyticsConfiguration
): Record<string, unknown> {
  const template = getTemplate(config.templateKey);
  if (!template) {
    throw new Error(`Template '${config.templateKey}' not found`);
  }

  // Start with template defaults
  const params: Record<string, unknown> = {
    ...template.defaultParams,
  };

  // Add configuration options (labels, formats, etc)
  if (config.options) {
    Object.assign(params, { options: { ...config.options } });
    // Also flatten some common options that processors might expect directly
    if (config.options.labelMap) params.labelMap = config.options.labelMap;
  }

  // Add configuration params (override defaults)
  if (config.params) {
    Object.assign(params, config.params);
  }

  // Add field mappings as processor params
  Object.assign(params, config.fieldMapping);

  // Also expose nested mapping for processors that expect 'fieldMapping' object
  if (config.fieldMapping && typeof config.fieldMapping === 'object') {
    params.fieldMapping = { ...config.fieldMapping };
  }

  return params;
}

/**
 * Gets the processor key from a configuration.
 *
 * @param config The analytics configuration
 * @returns The processor key
 */
export function getProcessorKeyFromConfig(config: AnalyticsConfiguration): string {
  const template = getTemplate(config.templateKey);
  if (!template) {
    throw new Error(`Template '${config.templateKey}' not found`);
  }
  return template.processor;
}
