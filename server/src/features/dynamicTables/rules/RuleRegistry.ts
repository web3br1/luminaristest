/**
 * RuleRegistry
 *
 * Lightweight plugin registry used by DynamicTableService to resolve which
 * rule plugins apply to a given operation (table + lifecycle hook).
 *
 * Add new plugins by importing and registering them at the bottom of this file.
 */
import type { RulePlugin, RuleContext } from './RuleTypes';
import { AppointmentsPlugin } from './plugins/AppointmentsPlugin';
import { SalesPlugin } from './plugins/SalesPlugin';
import { ProductAutoStockPlugin } from './plugins/ProductAutoStockPlugin';
import { UnitAutoStockPlugin } from './plugins/UnitAutoStockPlugin';
import { StockMovementsApplyPlugin } from './plugins/StockMovementsApplyPlugin';
import { EmployeesPlugin } from './plugins/EmployeesPlugin';
import { LeadsPlugin } from './plugins/LeadsPlugin';
import { LeadsSeedOnUnitPlugin } from './plugins/LeadsSeedOnUnitPlugin';
import { CommissionsPlugin } from './plugins/CommissionsPlugin';
import { GoalsPlugin } from './plugins/GoalsPlugin';

export class RuleRegistry {
  private plugins: RulePlugin[] = [];

  register(plugin: RulePlugin) {
    this.plugins.push(plugin);
  }

  getApplicable(ctx: RuleContext): RulePlugin[] {
    return this.plugins.filter(p => {
      try {
        return p.supports(ctx);
      } catch {
        return false;
      }
    });
  }
}

export const globalRuleRegistry = new RuleRegistry();

// Domain-specific plugins.
// Note: field `format`, `validation` ranges, `compositeUnique` and presence checks are
// enforced declaratively by the schema (buildZodSchema + validateAdvancedRules), not by plugins.
globalRuleRegistry.register(AppointmentsPlugin);
globalRuleRegistry.register(SalesPlugin);
globalRuleRegistry.register(ProductAutoStockPlugin);
globalRuleRegistry.register(UnitAutoStockPlugin);
globalRuleRegistry.register(StockMovementsApplyPlugin);
globalRuleRegistry.register(EmployeesPlugin);
globalRuleRegistry.register(LeadsPlugin);
globalRuleRegistry.register(LeadsSeedOnUnitPlugin);
globalRuleRegistry.register(CommissionsPlugin);
globalRuleRegistry.register(GoalsPlugin);
