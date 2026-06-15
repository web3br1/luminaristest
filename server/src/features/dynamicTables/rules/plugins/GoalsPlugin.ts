/**
 * GoalsPlugin
 *
 * Handles the only side-effect that cannot be expressed declaratively:
 * auto-computing `result` (Reached / Partial / Not Reached) based on
 * actualAmount vs targetAmount.
 *
 * Date validation (endDate > startDate) and range checks (amounts >= 0)
 * are now declared in GoalsModule.schema.compare and field validation
 * presets respectively — no duplication needed here.
 */
import type { RulePlugin, RuleContext } from '../RuleTypes';
import { tableMatches } from '../shared/tableFinder';

async function autoComputeResult(ctx: RuleContext, after: Record<string, unknown>) {
    const targetAmount = after?.targetAmount;
    const actualAmount = after?.actualAmount;
    const endDate = after?.endDate ? new Date(after.endDate) : null;

    if (targetAmount && actualAmount !== undefined && actualAmount !== null) {
        const target = Number(targetAmount);
        const actual = Number(actualAmount);
        if (target > 0) {
            const progress = (actual / target) * 100;
            if (progress >= 100) {
                after.result = 'Reached';
            } else if (progress >= 50) {
                after.result = 'Partial';
            } else if (endDate && new Date() > endDate) {
                after.result = 'Not Reached';
            }
        }
    }
}

const SCHEMA_KEYS = {
    GOALS: 'goals',
};

export const GoalsPlugin: RulePlugin = {
    name: 'GoalsPlugin',
    supports(ctx) {
        return tableMatches(ctx.table, { categories: ['operations'], internalNames: [SCHEMA_KEYS.GOALS], names: ['Goals', 'goals', 'Metas'] });
    },
    async beforeCreate(ctx) {
        await autoComputeResult(ctx, ctx.after ?? {});
    },
    async beforeUpdate(ctx) {
        await autoComputeResult(ctx, ctx.after ?? {});
    },
};
