/**
 * Dynamic Templates Index
 *
 * Registers all dynamic/generic templates for user-customizable analytics.
 */

// Import and register all templates
import './AggregatePipelineTemplate';
import './StatusDistributionTemplate';
import './StatusComparisonTemplate';
import './TemporalAggregationTemplate';
import './FormulaCalculationTemplate';
import './MultiTableCalculationTemplate';

// Re-export for direct access
export { aggregatePipelineTemplate } from './AggregatePipelineTemplate';
export { statusDistributionTemplate } from './StatusDistributionTemplate';
export { statusComparisonTemplate } from './StatusComparisonTemplate';
export { temporalAggregationTemplate } from './TemporalAggregationTemplate';
export { formulaCalculationTemplate } from './FormulaCalculationTemplate';
export { multiTableCalculationTemplate } from './MultiTableCalculationTemplate';

