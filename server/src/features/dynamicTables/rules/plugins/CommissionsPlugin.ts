/**
 * CommissionsPlugin
 *
 * Handles the only side-effect that cannot be expressed declaratively:
 * auto-stamping `paidAt` when a commission enters the `Paid` state.
 *
 * Everything else is now declarative:
 * - Required fields (employeeId, saleId, amount) and ranges (amount >= 0,
 *   commissionRate 0-100) are enforced by field presets (required + validation).
 * - Allowed status transitions (Pending -> Paid | Cancelled) are enforced by
 *   CommissionsModule.schema.lifecycle.
 * - Immutability of Paid commissions is enforced by CommissionsModule.schema.immutableAfter.
 */
import type { RulePlugin, RuleContext } from '../RuleTypes';
import { tableMatches } from '../shared/tableFinder';

async function autoStampPaidAt(_ctx: RuleContext, after: Record<string, unknown>, before?: Record<string, unknown>) {
    const status = String(after?.status || 'Pending');
    const prevStatus = String(before?.status || 'Pending');
    if (status === 'Paid' && prevStatus !== 'Paid' && !after?.paidAt) {
        after.paidAt = new Date().toISOString();
    }
}

const SCHEMA_KEYS = {
    COMMISSIONS: 'commissions',
};

export const CommissionsPlugin: RulePlugin = {
    name: 'CommissionsPlugin',
    supports(ctx) {
        return tableMatches(ctx.table, { categories: ['finance'], internalNames: [SCHEMA_KEYS.COMMISSIONS], names: ['Commissions', 'commissions', 'Comissões'] });
    },
    async beforeCreate(ctx) {
        await autoStampPaidAt(ctx, ctx.after as any);
    },
    async beforeUpdate(ctx) {
        await autoStampPaidAt(ctx, ctx.after as any, ctx.before as any);
    },
};
