'use client';

import React from 'react';
import { formatKpiDisplayValue, getTrend, getPreviousPeriodLabel } from './kpiUtils';
import { useFormatCurrency } from '@/lib/context/CurrencyContext';

// =============================================================================
// TYPES
// =============================================================================

interface KpiValueHeaderProps {
    /** Current value of the KPI */
    value: number;
    /** Previous period value (optional) */
    previousValue?: number;
    /** Format type: 'currency' | 'percent' | 'number' */
    format: string;
    /** Currency code (optional) */
    currency?: string;
    /** Display mode: 'card' | 'graph' | 'alert' */
    displayMode: string;
    /** Whether higher is better (default: true) */
    higherIsBetter?: boolean;
    /** KPI name */
    name: string;
    /** Current date preset for period label */
    datePreset: string;
}

// =============================================================================
// COMPONENT
// =============================================================================

/**
 * KpiValueHeader — Displays the current value, trend badge, previous value,
 * and KPI name in the detail panel header.
 */
export default function KpiValueHeader({
    value,
    previousValue,
    format,
    currency,
    displayMode,
    higherIsBetter = true,
    name,
    datePreset,
}: KpiValueHeaderProps) {
    const formatCurrencyFn = useFormatCurrency();
    const trend = getTrend(value, previousValue, higherIsBetter);

    return (
        <div className="bg-white dark:bg-neutral-900 rounded-xl border border-gray-200 dark:border-gray-800 p-5 shadow-sm text-center">
            <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-1 font-bold">
                Valor Atual
            </p>

            <p className={`text-3xl font-bold tracking-tight ${
                displayMode === 'alert'
                    ? 'text-amber-600 dark:text-amber-400'
                    : 'text-gray-900 dark:text-white'
            }`}>
                {formatKpiDisplayValue(value, format, currency, formatCurrencyFn)}
            </p>

            {/* Trend Badge */}
            {trend && (
                <div className="mt-2 inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-50 dark:bg-neutral-800">
                    <span className={trend.isGood ? 'text-emerald-500' : 'text-rose-500'}>
                        {trend.formatted}
                    </span>
                    <span className="text-gray-400 dark:text-gray-500 font-normal">
                        vs {getPreviousPeriodLabel(datePreset)}
                    </span>
                </div>
            )}

            {/* Previous Period Value */}
            {previousValue != null && previousValue > 0 && (
                <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-1.5">
                    Período anterior:{' '}
                    <span className="font-semibold text-gray-500 dark:text-gray-400">
                        {formatKpiDisplayValue(previousValue, format, currency, formatCurrencyFn)}
                    </span>
                </p>
            )}

            <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                {name}
            </p>
        </div>
    );
}
