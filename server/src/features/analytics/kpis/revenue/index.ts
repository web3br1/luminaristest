/**
 * Revenue KPIs
 *
 * Registers all revenue-related KPI processors and templates.
 */

import { registerProcessor } from '../../core';
import { revenueKpiProcessor } from './RevenueKpiProcessor';

// Register processor
registerProcessor('revenueKpis', revenueKpiProcessor);

// Register template (auto-registers on import)
import './RevenueKpiTemplate';

// Export
export { revenueKpiProcessor } from './RevenueKpiProcessor';
export { revenueKpiTemplate } from './RevenueKpiTemplate';

