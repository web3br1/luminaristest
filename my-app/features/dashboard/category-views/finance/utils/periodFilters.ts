import type { PeriodFilter } from '../types/common.types';

/**
 * Verifica se uma data pertence ao período selecionado.
 * Utilitário compartilhado por useSalesLogic e useExpensesLogic.
 */
export function isInPeriod(dateValue: unknown, period: PeriodFilter): boolean {
    if (period === 'all') return true;
    if (!dateValue) return false;

    const date = new Date(String(dateValue));
    if (isNaN(date.getTime())) return false; // data inválida não pertence a nenhum período

    const now = new Date();
    const thisMonth   = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonth   = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const last3Months = new Date(now.getFullYear(), now.getMonth() - 3, 1);
    const thisYear    = new Date(now.getFullYear(), 0, 1);

    switch (period) {
        case 'this_month':    return date >= thisMonth;
        case 'last_month':    return date >= lastMonth && date < thisMonth;
        case 'last_3_months': return date >= last3Months;
        case 'this_year':     return date >= thisYear;
        default:              return true;
    }
}
