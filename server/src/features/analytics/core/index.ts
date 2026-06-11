/**
 * Analytics Core
 *
 * Core infrastructure for the analytics system.
 * Exports models, registries, engine utilities, and pipeline types.
 */

// Models
export * from './models';

// Registries
export {
  registerProcessor,
  getProcessor,
  getRegisteredProcessors,
  hasProcessor,
  type AnalyticsProcessor,
  type AnalyticsProcessorContext,
  type TableDataRow,
  type ChartDataPoint,
} from './ProcessorRegistry';

export {
  registerTemplate,
  getTemplate,
  getAllTemplates,
  getRegisteredTemplateKeys,
  hasTemplate,
  templateRegistry,
} from './TemplateRegistry';

// Engine utilities
export * from './engine';

// Pipeline
export * from './pipeline';

