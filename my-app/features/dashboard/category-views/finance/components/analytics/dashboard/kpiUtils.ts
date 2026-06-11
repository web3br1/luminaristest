'use client';

import { formatCompactCurrency, abbreviateNumber } from '@/features/dashboard/shared/utils/formatters';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Trend data for KPI comparison
 */
export interface KpiTrend {
    value: string;
    isPositive: boolean;
    isGood: boolean;
    formatted: string;
}

// =============================================================================
// FORMATTING
// =============================================================================

/**
 * Format a KPI value based on its format type
 */
export function formatKpiDisplayValue(
    value: number,
    format: string,
    currency?: string,
    formatCurrencyFn?: (v: number) => string,
): string {
    if (format === 'percent') return `${value.toFixed(1)}%`;
    if (format === 'currency') {
        return formatCurrencyFn
            ? formatCurrencyFn(value)
            : formatCompactCurrency(value, 'pt-BR', currency || 'BRL');
    }
    return abbreviateNumber(value);
}

// =============================================================================
// TREND CALCULATION
// =============================================================================

/**
 * Calculate percentage trend (variance) between current and previous values
 */
export function getTrend(current: number, previous?: number, higherIsBetter = true): KpiTrend | null {
    if (previous === undefined || previous === 0) return null;
    const variance = ((current - previous) / Math.abs(previous)) * 100;
    if (Math.abs(variance) < 0.1) return null;

    const isPositive = variance > 0;
    const isGood = higherIsBetter ? isPositive : !isPositive;

    return {
        value: Math.abs(variance).toFixed(1),
        isPositive,
        isGood,
        formatted: `${isPositive ? '▲' : '▼'} ${Math.abs(variance).toFixed(1)}%`
    };
}

// =============================================================================
// PERIOD INFO
// =============================================================================

/**
 * Get human-readable period info based on datePreset
 */
export function getReadablePeriodInfo(datePreset: string): { current: string; previous: string; label: string } {
    const now = new Date();
    const fmt = (d: Date) => d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
    const fmtMonth = (d: Date) => d.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

    switch (datePreset) {
        case 'today': {
            const yesterday = new Date(now); yesterday.setDate(now.getDate() - 1);
            return { current: `Hoje (${fmt(now)})`, previous: `Ontem (${fmt(yesterday)})`, label: 'Diário' };
        }
        case 'thisWeek': {
            const weekStart = new Date(now); weekStart.setDate(now.getDate() - now.getDay());
            const prevWeekStart = new Date(weekStart); prevWeekStart.setDate(weekStart.getDate() - 7);
            const prevWeekEnd = new Date(weekStart); prevWeekEnd.setDate(weekStart.getDate() - 1);
            return { current: `${fmt(weekStart)} – ${fmt(now)}`, previous: `${fmt(prevWeekStart)} – ${fmt(prevWeekEnd)}`, label: 'Semanal' };
        }
        case 'thisMonth': {
            const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
            const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            const prevMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);
            return { current: `${fmt(monthStart)} – ${fmt(now)}`, previous: `${fmt(prevMonthStart)} – ${fmt(prevMonthEnd)}`, label: 'Mensal' };
        }
        case 'last30Days': {
            const start30 = new Date(now); start30.setDate(now.getDate() - 30);
            const prev60 = new Date(now); prev60.setDate(now.getDate() - 60);
            const prev31 = new Date(now); prev31.setDate(now.getDate() - 31);
            return { current: `${fmt(start30)} – ${fmt(now)}`, previous: `${fmt(prev60)} – ${fmt(prev31)}`, label: 'Últ. 30 Dias' };
        }
        case 'lastMonth': {
            const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            const prevPrevStart = new Date(now.getFullYear(), now.getMonth() - 2, 1);
            return { current: fmtMonth(lastMonthStart), previous: fmtMonth(prevPrevStart), label: 'Mês Passado' };
        }
        case 'thisYear': {
            const yearStart = new Date(now.getFullYear(), 0, 1);
            return { current: `${fmt(yearStart)} – ${fmt(now)}`, previous: `Ano anterior (${now.getFullYear() - 1})`, label: 'Anual (YTD)' };
        }
        default:
            return { current: 'Período atual', previous: 'Período anterior', label: datePreset };
    }
}

/**
 * Get a label for the previous period based on the datePreset
 */
export function getPreviousPeriodLabel(datePreset: string): string {
    switch (datePreset) {
        case 'thisWeek': return 'semana passada';
        case 'today': return 'ontem';
        case 'last30Days': return '30d anteriores';
        case 'thisYear': return 'ano passado';
        default: return 'mês passado';
    }
}
