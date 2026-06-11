import React from 'react';
import SpeedometerChart from '../charts/SpeedometerChart';

interface DashboardGaugeCardProps {
    title: string;
    value: string; // Display string (e.g. "45%")
    numericValue: number; // Raw number for the gauge
    change?: string;
    trend?: 'up' | 'down' | 'flat';
    higherIsBetter?: boolean;
    idealTarget?: number;
    idealLabel?: string;
}

/**
 * DashboardGaugeCard - Gauge-style KPI metric card
 */
export default function DashboardGaugeCard({
    title,
    value,
    numericValue,
    change,
    trend,
    higherIsBetter = true,
    idealTarget,
    idealLabel,
}: DashboardGaugeCardProps) {
    return (
        <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-5 shadow-sm hover:shadow-md transition-shadow duration-200 flex flex-col h-full">
            {/* Header */}
            <div className="flex items-start justify-between mb-2">
                <h3 className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                    {title}
                </h3>
            </div>

            {/* Gauge Visual */}
            <div className="flex-1 flex flex-col items-center justify-center py-2">
                <SpeedometerChart
                    value={numericValue}
                    title={title}
                    higherIsBetter={higherIsBetter}
                    idealTarget={idealTarget}
                    idealLabel={idealLabel}
                />
            </div>

            {/* Footer with change */}
            {change && (
                <div className="pt-3 border-t border-gray-100 dark:border-gray-800 flex items-center justify-center">
                   <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${trend === 'up' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'} flex items-center gap-0.5`}>
                        {trend === 'up' ? '▲' : '▼'}
                        {change}
                    </span>
                </div>
            )}
        </div>
    );
}
