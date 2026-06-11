/**
 * KPIs Index
 *
 * Registers all specific KPI processors and templates.
 * These are optimized for performance with pre-defined calculations.
 *
 * KPI Categories:
 * - Revenue: 17 KPIs
 * - Cost: 14 KPIs
 * - Profit/Margin: 18 KPIs + dimension analysis
 * - Cashflow/Solvency: 11 KPIs
 * - Sales: Product profit over time
 *
 * Total: 60+ specific KPIs
 */

// Register all KPI modules
import './revenue';
import './cost';
import './profit';
import './cashflow';
import './sales';

// Re-export for convenience
export * from './revenue';
export * from './cost';
export * from './profit';
export * from './cashflow';
export * from './sales';

