/**
 * Pipeline Compiler
 *
 * Validates and compiles pipeline specifications.
 */

import type { PipelineSpec, CompiledPipeline, Measure, Dimension, Filter } from './Pipeline';

/**
 * Validates filter specifications
 */
export function validateFilters(filters?: Filter[]): void {
  if (!filters) return;

  for (const f of filters) {
    if (!f || typeof f.field !== 'string' || typeof f.op !== 'string') {
      throw new Error('Invalid filter');
    }
  }
}

/**
 * Validates dimension specifications
 */
export function validateDimensions(dimensions?: Dimension[]): void {
  if (!dimensions) return;

  for (const d of dimensions) {
    if (d.type === 'field') {
      if (!d.field) throw new Error('Field dimension requires field');
    } else if (d.type === 'period') {
      if (!d.dateField || !d.period) {
        throw new Error('Period dimension requires dateField and period');
      }
    } else {
      throw new Error(`Unsupported dimension: ${(d as { type?: unknown }).type}`);
    }
  }
}

/**
 * Validates measure specifications
 */
export function validateMeasures(measures: Measure[]): void {
  if (!Array.isArray(measures) || measures.length === 0) {
    throw new Error('At least one measure is required');
  }

  for (const m of measures) {
    switch (m.type) {
      case 'sum':
      case 'avg':
        if (!m.field) throw new Error(`${m.type} measure requires field`);
        break;
      case 'count':
        // optional field
        break;
      case 'formula':
        if (!m.expression || typeof m.variables !== 'object') {
          throw new Error('formula measure requires expression and variables');
        }
        break;
      default:
        throw new Error(`Unsupported measure type: ${(m as { type?: unknown }).type}`);
    }
  }
}

/**
 * Compiles a pipeline specification
 */
export function compilePipeline(spec: PipelineSpec): CompiledPipeline {
  if (!spec || !spec.source) {
    throw new Error('Pipeline requires a source');
  }

  validateFilters(spec.filters);
  validateDimensions(spec.dimensions);
  validateMeasures(spec.measures);

  return spec as CompiledPipeline;
}

