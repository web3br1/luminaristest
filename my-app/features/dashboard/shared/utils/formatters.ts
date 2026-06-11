/**
 * Shared utility functions for formatting and rendering data in the dashboard.
 *
 * Pure functions — no React hooks, no browser-only APIs. Safe to import from
 * server components, RSC, or scripts. Do not add `'use client'` here.
 */

// ============================================
// Currency Formatting
// ============================================

/**
 * Format a number as currency based on locale
 */
export function formatCurrency(value?: number | null, locale = 'pt-BR', currency = 'BRL'): string {
    const n = typeof value === 'number' && isFinite(value) ? value : 0;
    try {
        return new Intl.NumberFormat(locale, { style: 'currency', currency }).format(n);
    } catch (e) {
        return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
    }
}

/**
 * Alias for formatCurrency specifically for BRL
 */
export const formatBRL = (value?: number | null) => formatCurrency(value, 'pt-BR', 'BRL');

/**
 * Format a number as percentage
 */
export function formatPercent(value?: number | null, decimals = 0, locale = 'pt-BR'): string {
    const n = typeof value === 'number' && isFinite(value) ? value : 0;
    return n.toLocaleString(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals }) + '%';
}

/**
 * Abbreviate large numbers (K, M, B)
 */
export function abbreviateNumber(value: number, locale = 'pt-BR'): string {
    const absValue = Math.abs(value);
    if (absValue >= 1000000000) {
        return (value / 1000000000).toLocaleString(locale, { maximumFractionDigits: 1 }) + 'B';
    }
    if (absValue >= 1000000) {
        return (value / 1000000).toLocaleString(locale, { maximumFractionDigits: 1 }) + 'M';
    }
    if (absValue >= 10000) {
        return (value / 1000).toLocaleString(locale, { maximumFractionDigits: 0 }) + 'K';
    }
    return value.toLocaleString(locale);
}

/**
 * Format currency in a compact way for large values
 */
export function formatCompactCurrency(value: number, locale = 'pt-BR', currency = 'BRL'): string {
    const absValue = Math.abs(value);
    if (absValue < 10000) {
        return formatCurrency(value, locale, currency);
    }
    const abbreviated = abbreviateNumber(value, locale);
    if (currency === 'BRL') {
        return `R$ ${abbreviated}`;
    }
    return `${currency} ${abbreviated}`;
}

/**
 * Calculate percentage of value relative to total
 */
export function calcPercent(value: number, total: number): number {
    if (!total) return 0;
    return Math.round((value / total) * 100);
}

/**
 * Format a date string to Brazilian locale (dd/mm/yyyy)
 */
export function formatDateBR(date?: string | Date | null): string {
    if (!date) return '—';
    const d = typeof date === 'string' ? new Date(date) : date;
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('pt-BR');
}

// ============================================
// Date Formatting
// ============================================

/**
 * Format date based on locale
 */
export function formatDate(
    value: Date | string | null | undefined,
    locale = 'pt-BR',
    options: { showTime?: boolean; showWeekday?: boolean; dateOnly?: boolean } = {}
): string {
    if (!value) return '—';

    let d: Date;
    if (value instanceof Date) {
        d = value;
    } else if (options.dateOnly) {
        // Extrai apenas YYYY-MM-DD de qualquer formato (ISO com ou sem offset)
        // Funciona com: "2001-02-17", "2001-02-17T00:00:00.000Z", "2001-02-17T03:00:00-03:00"
        const datePart = String(value).slice(0, 10);
        d = new Date(datePart + 'T00:00:00'); // força parse como horário local
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
        // Date-only string sem timestamp → parse como local
        d = new Date(String(value) + 'T00:00:00');
    } else {
        d = new Date(value); // datetime real → mantém conversão UTC→local correta
    }

    if (isNaN(d.getTime())) return String(value);

    const dateOptions: Intl.DateTimeFormatOptions = {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    };

    if (options.showWeekday) {
        dateOptions.weekday = 'short';
    }

    if (options.showTime) {
        dateOptions.hour = '2-digit';
        dateOptions.minute = '2-digit';
    }

    return new Intl.DateTimeFormat(locale, dateOptions).format(d);
}

// ============================================
// Generic Cell Rendering
// ============================================

/**
 * Render any value as a React node for table cells
 */
export function renderCell(val: unknown, t?: (key: string, def?: string) => string): string {
    if (val == null) return '—';
    if (typeof val === 'number') return String(val);
    if (typeof val === 'boolean') return val ? (t ? t('yes', 'Yes') : 'Yes') : (t ? t('no', 'No') : 'No');
    if (typeof val === 'string') return val;
    if (Array.isArray(val)) return val.map(v => renderCell(v, t)).join(', ');
    if (val && typeof val === 'object') return JSON.stringify(val);
    return String(val);
}

/**
 * Render a value with type-aware formatting based on schema field type
 */
export function renderTypedValue(
    value: unknown,
    fieldType?: string,
    options?: {
        relationLookup?: Map<string, string>,
        locale?: string,
        currency?: string,
        numberFormat?: 'currency' | 'percentage' | 'integer' | 'decimal',
        t?: (key: string, def?: string) => string
    }
): string {
    if (value == null || value === '') return '—';

    const type = (fieldType || '').toLowerCase();
    const locale = options?.locale || 'pt-BR';
    const currency = options?.currency || 'BRL';
    const t = options?.t;

    switch (type) {
        case 'currency':
        case 'money':
            return formatCurrency(Number(value), locale, currency);
        case 'date':
            return formatDate(value as string | Date, locale, { dateOnly: true });
        case 'datetime':
            return formatDate(value as string | Date, locale, { showTime: true });
        case 'boolean':
            return value ? (t ? t('active', 'Active') : 'Active') : (t ? t('inactive', 'Inactive') : 'Inactive');
        case 'number':
        case 'integer':
        case 'float': {
            const n = Number(value);
            if (isNaN(n)) return String(value);
            // Dispatch by numberFormat before falling back to generic locale string
            switch (options?.numberFormat) {
                case 'currency':
                    return formatCurrency(n, locale, currency);
                case 'percentage':
                    return formatPercent(n, 0, locale);
                case 'integer':
                    return Math.round(n).toLocaleString(locale);
                case 'decimal':
                    return n.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
                default:
                    return n.toLocaleString(locale);
            }
        }
        case 'relation':
            if (options?.relationLookup) {
                if (Array.isArray(value)) {
                    return value.map(v => options.relationLookup?.get(String(v)) || String(v)).join(', ');
                }
                return options.relationLookup.get(String(value)) || String(value);
            }
            return String(value);
        default:
            return renderCell(value, t);
    }
}

// ============================================
// Status Helpers
// ============================================

type StatusColorScheme = 'success' | 'warning' | 'error' | 'info' | 'neutral';

const statusColorMap: Record<StatusColorScheme, string> = {
    success: 'bg-emerald-600/15 text-emerald-400 ring-1 ring-inset ring-emerald-600/30',
    warning: 'bg-amber-600/15 text-amber-400 ring-1 ring-inset ring-amber-600/30',
    error: 'bg-red-600/15 text-red-400 ring-1 ring-inset ring-red-600/30',
    info: 'bg-blue-600/15 text-blue-400 ring-1 ring-inset ring-blue-600/30',
    neutral: 'bg-gray-500/10 text-gray-400 ring-1 ring-inset ring-gray-500/20',
};

/**
 * Get CSS classes for a status badge
 */
export function getStatusBadgeClasses(scheme: StatusColorScheme): string {
    return `inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${statusColorMap[scheme]}`;
}

/**
 * Determine color scheme based on common status values
 */
export function getStatusColorScheme(status?: string): StatusColorScheme {
    const s = (status || '').toLowerCase();

    // Success states
    if (['paid', 'pago', 'finalized', 'finalizado', 'completed', 'concluído', 'active', 'ativo', 'approved', 'aprovado'].includes(s)) {
        return 'success';
    }

    // Warning states
    if (['pending', 'pendente', 'draft', 'rascunho', 'paused', 'pausado', 'scheduled', 'agendado'].includes(s)) {
        return 'warning';
    }

    // Error states
    if (['cancelled', 'cancelado', 'failed', 'falhou', 'no-show', 'overdue', 'atrasado'].includes(s)) {
        return 'error';
    }

    // Info states
    if (['processing', 'processando', 'in_progress', 'em_andamento'].includes(s)) {
        return 'info';
    }

    return 'neutral';
}

// ============================================
// Search/Filter Helpers
// ============================================

/**
 * Filter records by a search query across all data fields or specific allowed fields
 */
export function filterByQuery<T extends { data?: Record<string, unknown> }>(
    records: T[],
    query: string,
    searchableFields?: string[]
): T[] {
    if (!query.trim()) return records;
    const q = query.toLowerCase();
    
    return records.filter(r => {
        const data = r.data || r;
        if (!searchableFields) {
            // Fallback: search across all values
            return Object.values(data).some(v =>
                String(v ?? '').toLowerCase().includes(q)
            );
        }
        
        // Search only across allowed fields
        return searchableFields.some(fieldName => {
            const val = (data as Record<string, unknown>)[fieldName];
            return val != null && String(val).toLowerCase().includes(q);
        });
    });
}
