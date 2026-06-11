/**
 * Formatters - Centralized formatting utilities for the Finance module.
 *
 * @description
 * These are **pure utility functions** for use in analytics/chart contexts
 * where React hooks (and therefore `CurrencyContext` / `useRenderTypedValue`)
 * are not available. Locale and currency are intentionally hardcoded to
 * `pt-BR` / `BRL` for the Finance module's current scope.
 *
 * For locale-aware formatting in React components, use `useRenderTypedValue`
 * from `features/dashboard/shared/hooks/useRenderTypedValue` instead.
 */

/**
 * Format a number as Brazilian Real currency.
 */
export function formatBRL(value?: number): string {
    if (typeof value !== 'number' || isNaN(value)) return 'R$ 0,00';
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/**
 * Format a number as compact BRL (K, M).
 */
export function formatBRLCompact(value?: number): string {
    if (typeof value !== 'number' || isNaN(value)) return 'R$ 0';
    const absValue = Math.abs(value);

    if (absValue >= 1_000_000) {
        return `R$ ${(value / 1_000_000).toFixed(1)}M`;
    }
    if (absValue >= 1_000) {
        return `R$ ${(value / 1_000).toFixed(1)}K`;
    }
    return formatBRL(value);
}

/**
 * Calculate percentage of value relative to total.
 */
export function calcPercent(value: number, total: number): number {
    if (!total) return 0;
    return Math.round((value / total) * 100);
}

/**
 * Format a date string to Brazilian locale.
 */
export function formatDateBR(date?: string | Date | null): string {
    if (!date) return '—';
    const d = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('pt-BR');
}

/**
 * Format a datetime string to Brazilian locale.
 */
export function formatDateTimeBR(date?: string | Date | null): string {
    if (!date) return '—';
    const d = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleString('pt-BR');
}

/**
 * Parse a BRL currency string to number.
 */
export function parseBRL(input: string): number {
    if (!input) return 0;
    const cleaned = input.replace(/[^0-9,.-]/g, '').replace(/\./g, '').replace(',', '.');
    const num = parseFloat(cleaned);
    return Number.isFinite(num) ? num : 0;
}

/**
 * Format a number as percent (e.g., "75%").
 */
export function formatPercent(value?: number): string {
    if (typeof value !== 'number' || isNaN(value)) return '0%';
    return `${Math.max(0, Math.min(100, value)).toLocaleString('pt-BR', { maximumFractionDigits: 2 })}%`;
}

/**
 * Parse a percent string to number (0-100).
 */
export function parsePercent(input: string): number {
    if (!input) return 0;
    const cleaned = input.replace(/[^0-9,.-]/g, '').replace(/\./g, '').replace(',', '.');
    const num = parseFloat(cleaned);
    if (!Number.isFinite(num)) return 0;
    return Math.max(0, Math.min(100, num));
}
