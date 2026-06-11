/**
 * Cashflow KPIs
 *
 * Registers all cashflow and solvency related KPI processors and templates.
 */

import { registerProcessor } from '../../core';
import { cashflowKpiProcessor } from './CashflowKpiProcessor';

// Register processor
registerProcessor('cashflowKpis', cashflowKpiProcessor);

// Register template (auto-registers on import)
import './CashflowKpiTemplate';

// Export
export { cashflowKpiProcessor } from './CashflowKpiProcessor';
export { cashflowKpiTemplate } from './CashflowKpiTemplate';

