'use client';

import React from 'react';

interface TrendDataPoint {
    name: string;
    value: number;
}

interface DashboardTrendChartProps {
    title: string;
    data: TrendDataPoint[];
    period: 'year' | 'month' | 'week';
}

/**
 * DashboardTrendChart - Main bar chart for KPI trends
 * 
 * CSS-only bar chart (no external chart library needed)
 */
export default function DashboardTrendChart({
    title,
    data,
    period,
}: DashboardTrendChartProps) {
    const dataValues = data.map(d => d.value);
    const maxValue = dataValues.length > 0 ? Math.max(...dataValues, 0) : 0;
    const safeMaxValue = maxValue === 0 ? 1 : maxValue;

    return (
        <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-5 shadow-sm h-full">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                    {title}
                </h3>
                <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                    <span className="flex items-center gap-1">
                        <span className="w-2.5 h-2.5 rounded-sm bg-indigo-600"></span>
                        {period === 'year' ? 'Anual' : period === 'month' ? 'Mensal' : 'Semanal'}
                    </span>
                </div>
            </div>

            {/* Y-axis labels */}
            <div className="flex">
                <div className="flex flex-col justify-between text-[10px] text-gray-400 dark:text-gray-500 pr-2 py-2" style={{ height: '200px' }}>
                    <span>{(maxValue / 1000).toFixed(0)}k</span>
                    <span>{(maxValue * 0.75 / 1000).toFixed(0)}k</span>
                    <span>{(maxValue * 0.5 / 1000).toFixed(0)}k</span>
                    <span>{(maxValue * 0.25 / 1000).toFixed(0)}k</span>
                    <span>0</span>
                </div>

                {/* Chart Area */}
                <div className="flex-1 relative">
                    {/* Grid Lines */}
                    <div className="absolute inset-0 flex flex-col justify-between pointer-events-none">
                        {[0, 1, 2, 3, 4].map(i => (
                            <div key={i} className="border-t border-gray-100 dark:border-gray-800 w-full h-0" />
                        ))}
                    </div>

                    {/* Bars */}
                    <div className="flex items-end justify-between gap-1 h-[200px] relative z-10">
                        {data.map((point, idx) => {
                            const heightPercent = (point.value / safeMaxValue) * 100;
                            const isHighest = point.value === maxValue;

                            return (
                                <div key={idx} className="flex-1 flex flex-col items-center group">
                                    {/* Tooltip */}
                                    <div className="opacity-0 group-hover:opacity-100 transition-opacity mb-1 px-2 py-1 bg-gray-900 dark:bg-gray-700 text-white text-[10px] rounded whitespace-nowrap">
                                        {point.value.toLocaleString('pt-BR')}
                                    </div>

                                    {/* Bar */}
                                    <div
                                        className={`
                      w-full max-w-[32px] rounded-t-md transition-all duration-300 cursor-pointer
                      ${isHighest
                                                ? 'bg-indigo-600 hover:bg-indigo-500'
                                                : 'bg-indigo-400 hover:bg-indigo-500'
                                            }
                    `}
                                        style={{ height: `${heightPercent}%`, minHeight: '4px' }}
                                    />
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* X-axis labels */}
            <div className="flex items-center justify-between mt-2 pl-8">
                {data.map((point, idx) => (
                    <span key={idx} className="text-[10px] text-gray-400 dark:text-gray-500 flex-1 text-center">
                        {point.name}
                    </span>
                ))}
            </div>
        </div>
    );
}
