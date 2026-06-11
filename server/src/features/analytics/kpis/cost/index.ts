/**
 * Cost KPIs
 *
 * Registers all cost-related KPI processors and templates.
 */

import { registerProcessor } from '../../core';
import { costKpiProcessor } from './CostKpiProcessor';
import { productCostKpiProcessor } from './ProductCostKpiProcessor';

// Register processors
registerProcessor('costKpis', costKpiProcessor);
registerProcessor('productCostKpis', productCostKpiProcessor);

// Register template (auto-registers on import)
import './CostKpiTemplate';

// Export
export { costKpiProcessor } from './CostKpiProcessor';
export { productCostKpiProcessor } from './ProductCostKpiProcessor';
export { costKpiTemplate, productCostKpiTemplate } from './CostKpiTemplate';

