/**
 * Profit KPIs
 *
 * Registers all profit and margin related KPI processors and templates.
 */

import { registerProcessor } from '../../core';
import { profitKpiProcessor } from './ProfitKpiProcessor';
import { profitByDimensionProcessor } from './ProfitByDimensionProcessor';

// Register processors
registerProcessor('profitKpis', profitKpiProcessor);
registerProcessor('profitByDimension', profitByDimensionProcessor);

// Register templates (auto-registers on import)
import './ProfitKpiTemplate';
import './ProfitByDimensionTemplate';

// Export
export { profitKpiProcessor } from './ProfitKpiProcessor';
export { profitByDimensionProcessor } from './ProfitByDimensionProcessor';
export { profitKpiTemplate } from './ProfitKpiTemplate';
export { profitByDimensionTemplate } from './ProfitByDimensionTemplate';

