/**
 * Sales KPIs
 *
 * Registers all sales-related KPI processors and templates.
 */

import { registerProcessor } from '../../core';
import { salesProfitByProductOverTimeProcessor } from './SalesProfitByProductProcessor';

// Register processors
registerProcessor('salesProfitByProductOverTime', salesProfitByProductOverTimeProcessor);

// Register templates (auto-registers on import)
import './SalesProfitByProductTemplate';

// Export
export { salesProfitByProductOverTimeProcessor } from './SalesProfitByProductProcessor';
export { salesProfitByProductOverTimeTemplate } from './SalesProfitByProductTemplate';

