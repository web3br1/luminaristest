/**
 * Analytics Feature
 *
 * Complete analytics system with:
 * - Core: Models, registries, engine utilities, pipeline types
 * - Dynamic: Generic processors/templates for user-customizable analytics
 * - KPIs: Optimized processors/templates for specific financial KPIs
 *
 * Structure:
 * ├── core/           # Infrastructure (models, registries, engine, pipeline)
 * ├── dynamic/        # Generic processors/templates for custom analytics
 * │   ├── processors/
 * │   └── templates/
 * ├── kpis/           # Specific KPI processors/templates (optimized)
 * │   ├── revenue/    # 17 revenue KPIs
 * │   ├── cost/       # 14 cost KPIs
 * │   ├── profit/     # 18+ profit/margin KPIs
 * │   └── sales/      # Sales-specific KPIs
 * └── services/       # Analytics service layer
 */

// Register all processors and templates
import './dynamic';
import './kpis';

// Export core
export * from './core';

// Export dynamic processors/templates
export * from './dynamic';

// Export KPI processors/templates
export * from './kpis';

