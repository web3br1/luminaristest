import type { PipelineSpec } from '../core/pipeline/Pipeline';
import { compilePipeline } from '../core/pipeline/Compiler';
import type { ITableSchema } from '@/features/dynamicTables/models/DynamicTable.model';

/**
 * Structure of an analytics definition from the database.
 */
interface AnalyticsDefinition {
  key?: string;
  title?: string;
  pipeline?: PipelineSpec;
  [key: string]: unknown;
}

/**
 * Result of validating an analytics definition.
 */
export type DefinitionValidationResult = {
  valid: boolean;
  errors: string[];
};

/**
 * Validates an analytics definition against its structure and pipeline specification.
 * 
 * @param def The analytics definition to validate
 * @param tableSchemas Map of table keys to their schemas for validation
 * @returns Validation result with errors if any
 */
export function validateAnalyticsDefinition(
  def: AnalyticsDefinition,
  tableSchemas: Map<string, ITableSchema>
): DefinitionValidationResult {
  const errors: string[] = [];
  if (!def) {
    return { valid: false, errors: ['Definition is empty'] };
  }
  if (!def.key || !def.title) {
    errors.push('Missing key or title');
  }
  if (!def.pipeline) {
    errors.push('Missing pipeline');
  } else {
    // Validate pipeline is an object
    if (typeof def.pipeline !== 'object' || def.pipeline === null) {
      errors.push('Pipeline must be an object');
    } else {
      // Validate minimum structure: must have source and measures
      const pipeline = def.pipeline as PipelineSpec;
      if (!pipeline.source) {
        errors.push('Pipeline must have a source');
      }
      if (!pipeline.measures || !Array.isArray(pipeline.measures) || pipeline.measures.length === 0) {
        errors.push('Pipeline must have at least one measure');
      }

      // Only compile if basic structure is valid
      if (errors.length === 0) {
        try {
          const compiled = compilePipeline(pipeline);
          // Basic field existence checks for presetTable refs
          if (compiled.source.kind === 'presetTable') {
            const tableKey = compiled.source.key.replace('@@PRESET_TABLE_KEY::', '');
            const schema = tableSchemas.get(tableKey);
            if (!schema) {
              errors.push(`Source table '${tableKey}' not found`);
            }
          } else if (compiled.source.kind === 'tableId') {
            const tableId = (compiled.source as any).id;
            const schemaExists = Array.from(tableSchemas.values()).some(s => (s as any).id === tableId || (s as any).key === tableId);
            if (!schemaExists) {
              errors.push(`Table with ID '${tableId}' not found`);
            }
          }
        } catch (e: unknown) {
          const errorMessage = e instanceof Error ? e.message : 'Invalid pipeline spec';
          errors.push(errorMessage);
        }
      }
    }
  }
  return { valid: errors.length === 0, errors };
}


