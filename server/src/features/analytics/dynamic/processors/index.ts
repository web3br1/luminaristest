/**
 * Dynamic Processors Index
 *
 * Registers all dynamic/generic processors for user-customizable analytics.
 * These processors are flexible and can be configured via templates.
 */

import { registerProcessor } from '../../core';

// Import processors
import { aggregatePipelineProcessor } from './AggregatePipelineProcessor';
import { statusDistributionProcessor } from './StatusDistributionProcessor';
import { statusComparisonProcessor } from './StatusComparisonProcessor';
import { temporalAggregationProcessor } from './TemporalAggregationProcessor';
import { formulaCalculationProcessor } from './FormulaCalculationProcessor';
import { multiTableCalculationProcessor } from './MultiTableCalculationProcessor';

// Register all dynamic processors
registerProcessor('aggregatePipeline', aggregatePipelineProcessor);
registerProcessor('statusDistribution', statusDistributionProcessor);
registerProcessor('statusComparison', statusComparisonProcessor);
registerProcessor('temporalAggregation', temporalAggregationProcessor);
registerProcessor('formulaCalculation', formulaCalculationProcessor);
registerProcessor('multiTableCalculation', multiTableCalculationProcessor);

// Export for direct use
export {
  aggregatePipelineProcessor,
  statusDistributionProcessor,
  statusComparisonProcessor,
  temporalAggregationProcessor,
  formulaCalculationProcessor,
  multiTableCalculationProcessor,
};

