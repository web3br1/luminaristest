'use client';

import React, { useMemo } from 'react';
import type { ChartPreset, ChartData, ChartDataPoint } from '../../../types';
import { useCurrency, SUPPORTED_CURRENCIES } from '@/lib/context/CurrencyContext';

interface KpiCardProps {
    chart: ChartPreset;
    data: ChartData;
    isSelected: boolean;
    onClick: () => void;
}

/**
 * Check if chart has sufficient data for evolution display
 */
function hasEvolutionData(data: ChartData): boolean {
    if (!data || data.error) return false;
    const chartData = data.data || [];
    if (chartData.length === 0) return false;

    const totalValue = chartData.reduce(
        (sum: number, item: ChartDataPoint) => sum + (typeof item.value === 'number' ? item.value : 0),
        0
    );

    return totalValue > 0 || chartData.length >= 2;
}

/**
 * Calculate primary value from chart data
 */
function calculatePrimaryValue(data: ChartData): { value: number; label: string } {
    const chartData = data.data || [];
    if (chartData.length === 0) return { value: 0, label: 'Total' };

    // Sum all values
    const total = chartData.reduce(
        (sum, item) => sum + (typeof item.value === 'number' ? item.value : 0),
        0
    );

    return { value: total, label: 'Total' };
}

// formatValue is now built inside the component using CurrencyContext

/**
 * KpiCard - Compact inline KPI display card
 * 
 * Displays KPI title and value without embedded chart.
 * Click to show chart details in sidebar.
 */
export default function KpiCard({ chart, data, isSelected, onClick }: KpiCardProps) {
    const hasData = useMemo(() => hasEvolutionData(data), [data]);
    const chartCurrency = chart.options?.currency as string | undefined;

    const { currency: userCurrency, formatCurrency } = useCurrency();
    const currencySymbol = SUPPORTED_CURRENCIES.find(c => c.code === userCurrency)?.symbol ?? '';

    const { value } = useMemo(
        () => calculatePrimaryValue(data),
        [data]
    );

    /**
     * Format a number for compact display in the card header.
     * Currency KPIs use the user's preferred currency symbol + K/M/B abbreviation.
     * Non-currency KPIs use plain number abbreviation.
     */
    const formatValue = (v: number): string => {
        const abs = Math.abs(v);
        const isMoney = Boolean(chartCurrency);
        const space = currencySymbol.length > 1 ? ' ' : ''; // "R$ " vs "$"

        if (abs >= 1_000_000_000) {
            const n = (v / 1_000_000_000).toFixed(1);
            return isMoney ? `${currencySymbol}${space}${n}B` : `${n}B`;
        }
        if (abs >= 1_000_000) {
            const n = (v / 1_000_000).toFixed(1);
            return isMoney ? `${currencySymbol}${space}${n}M` : `${n}M`;
        }
        if (abs >= 10_000) {
            const n = (v / 1_000).toFixed(0);
            return isMoney ? `${currencySymbol}${space}${n}K` : `${n}K`;
        }
        return isMoney ? formatCurrency(v) : new Intl.NumberFormat().format(Math.round(v));
    };

    // Handle error state
    if (data?.error) {
        return (
            <button
                onClick={onClick}
                className={`
          w-full text-left p-4 rounded-xl border transition-all duration-200
          border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20
          hover:shadow-md cursor-pointer
          ${isSelected ? 'ring-2 ring-red-500 shadow-lg' : ''}
        `}
            >
                <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-1 truncate">
                    {chart.title}
                </h4>
                <p className="text-xs text-red-600 dark:text-red-400 truncate">
                    Erro ao carregar dados
                </p>
            </button>
        );
    }

    return (
        <button
            onClick={onClick}
            className={`
        w-full text-left p-4 rounded-xl border transition-all duration-200
        ${isSelected
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 ring-2 ring-blue-500 shadow-lg'
                    : 'border-gray-200 dark:border-gray-700 bg-white dark:bg-neutral-900 hover:border-blue-300 dark:hover:border-blue-700 hover:shadow-md'
                }
        cursor-pointer group
      `}
        >
            {/* Card Header */}
            <div className="flex items-start justify-between gap-2 mb-2">
                <h4 className="text-sm font-semibold text-gray-900 dark:text-gray-100 truncate flex-1">
                    {chart.title}
                </h4>
                <span className={`
          text-xs px-2 py-0.5 rounded-full transition-colors
          ${isSelected
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-100 dark:bg-neutral-800 text-gray-500 group-hover:bg-blue-100 group-hover:text-blue-600'
                    }
        `}>
                    {isSelected ? '✓' : '▸'}
                </span>
            </div>

            {/* Card Content */}
            {hasData ? (
                <div className="space-y-1 overflow-hidden">
                    <p className="text-xl font-bold text-gray-900 dark:text-white tracking-tight truncate" title={formatValue(value)}>
                        {formatValue(value)}
                    </p>
                    <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                        Clique para ver evolução
                    </p>
                </div>
            ) : (
                <div className="py-2">
                    <div className="flex items-center gap-2 text-gray-400 dark:text-gray-500">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                        </svg>
                        <span className="text-xs italic">
                            Dados insuficientes para exibir evolução
                        </span>
                    </div>
                </div>
            )}
        </button>
    );
}
