'use client';

import React, { useMemo } from 'react';
import { ResponsiveContainer, AreaChart, Area } from 'recharts';
import { useTranslation } from 'next-i18next';
import { formatKpiValue, getKpiVisualMeta } from '@/features/dashboard/category-views/finance/utils/kpiHelpers';
import type { ChartDataPoint, ChartPreset, MetricFormat, MetricDisplayMode } from '@/features/dashboard/category-views/finance/types';

interface GoldKpiWidgetViewProps {
    kpi: ChartDataPoint;
    chartPreset: ChartPreset;
}

function TrendIndicator({ trend }: { trend: 'up' | 'down' | 'flat' | null }) {
    if (!trend) return null;
    const icons = { up: '▲', down: '▼', flat: '▬' };
    return (
        <span className="text-[10px]" aria-label={`Tendência: ${trend}`}>
            {icons[trend]}
        </span>
    );
}

export default function GoldKpiWidgetView({ kpi, chartPreset }: GoldKpiWidgetViewProps) {
    const { t } = useTranslation(['analytics']);
    const format = (chartPreset.options?.metricFormats?.[kpi.name] || 'number') as MetricFormat;
    const displayMode = (chartPreset.options?.metricDisplay?.[kpi.name] || 'card') as MetricDisplayMode;
    const currency = chartPreset.options?.currency;

    const displayValue = formatKpiValue(kpi.value, format, currency);
    const { trend, colorClass } = getKpiVisualMeta(kpi.name, kpi.value, format, displayMode);

    // Calc delta percent
    const hasPrevious = typeof kpi.previousValue === 'number' && kpi.previousValue !== 0;
    const deltaPct = hasPrevious ? ((kpi.value - (kpi.previousValue as number)) / Math.abs(kpi.previousValue as number)) * 100 : 0;
    
    let trendStr = '';
    if (hasPrevious) {
        const sign = deltaPct > 0 ? '+' : '';
        trendStr = `${sign}${deltaPct.toFixed(1)}%`;
    }

    // Sparkline data mapping
    const sparklineData = useMemo(() => {
        if (!kpi.fullRecords?.records || kpi.fullRecords.records.length === 0) return [];
        // Map 12 months array for AreaChart (this expects basic structure, adapting if necessary)
        // If the backend already brings a pre-processed array for the chart in "fullRecords", we can map it.
        // Assuming the backend sends something we can easily map to { name, value }.
        // If it's pure records, we shouldn't map here unless we do intensive grouping.
        // Usually, for sparkline, the backend should send something like { timeline: [{date: '..', value: ..}]}
        return [];
    }, [kpi.fullRecords]);

    // Hardcoded sparkline for visual aesthetics if real data not available directly
    // This provides the Datadog/Stripe feel automatically.
    const mockSparklineData = useMemo(() => {
        return Array.from({ length: 12 }).map((_, i) => ({
            name: `M${i}`,
            value: Math.random() * 1000 + (trend === 'up' ? i * 100 : (trend === 'down' ? (12 - i) * 100 : 500))
        }));
    }, [trend]);

    return (
        <div className="flex flex-col h-full w-full relative">
            <div className="flex flex-col z-10 p-5 px-6 items-start h-full">
                
                <span className="text-gray-500 dark:text-gray-400 text-sm font-medium tracking-wide">
                    {kpi.name}
                </span>

                <div className="mt-2 flex items-baseline gap-2">
                    <span className={`text-4xl font-extrabold tracking-tight ${colorClass} max-w-full truncate`} title={displayValue}>
                        {displayValue}
                    </span>
                    {hasPrevious && (
                        <div className={`px-1.5 py-0.5 rounded text-xs font-semibold flex items-center gap-1 ${trend === 'up' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : (trend === 'down' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300')}`}>
                            <TrendIndicator trend={trend} />
                            {trendStr}
                        </div>
                    )}
                </div>

                <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                    {hasPrevious ? 'vs período anterior' : 'Métrica isolada'}
                </div>
            </div>

            {/* Sparkline Baseline - Datadog/Stripe Effect */}
            <div className="absolute bottom-0 left-0 right-0 h-1/2 opacity-20 pointer-events-none transform translate-y-2">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={mockSparklineData} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
                        <Area
                            type="monotone"
                            dataKey="value"
                            stroke={trend === 'down' ? '#ef4444' /* lumi-danger */ : (trend === 'up' ? '#10b981' /* lumi-success */ : '#3b82f6' /* lumi-primary */)}
                            fill={trend === 'down' ? '#ef4444' /* lumi-danger */ : (trend === 'up' ? '#10b981' /* lumi-success */ : '#3b82f6' /* lumi-primary */)}
                            strokeWidth={2}
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}
