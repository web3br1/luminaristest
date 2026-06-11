'use client';

import React from 'react';

interface ComparisonDataPoint {
    name: string;
    current: number;
    previous: number;
}

interface DashboardBarComparisonProps {
    title: string;
    data: ComparisonDataPoint[];
    isHorizontal?: boolean;
}

/**
 * DashboardBarComparison - Comparison bar chart with current vs previous
 * 
 * Supports both horizontal and vertical orientations
 */
export default function DashboardBarComparison({
    title,
    data,
    isHorizontal = false,
}: DashboardBarComparisonProps) {
    const maxValue = Math.max(...data.flatMap(d => [d.current, d.previous]));

    if (isHorizontal) {
        return (
            <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-5 shadow-sm">
                {/* Header */}
                <div className="flex items-center justify-between mb-5">
                    <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                        {title}
                    </h3>
                    <div className="flex items-center gap-3 text-xs">
                        <span className="flex items-center gap-1">
                            <span className="w-2.5 h-2.5 rounded-sm bg-indigo-600"></span>
                            Atual
                        </span>
                        <span className="flex items-center gap-1">
                            <span className="w-2.5 h-2.5 rounded-sm bg-indigo-300"></span>
                            Anterior
                        </span>
                    </div>
                </div>

                {/* Horizontal Bars */}
                <div className="space-y-4">
                    {data.map((item, idx) => (
                        <div key={idx} className="space-y-2">
                            <span className="text-sm text-gray-600 dark:text-gray-400">{item.name}</span>
                            <div className="space-y-1.5">
                                {/* Current */}
                                <div className="flex items-center gap-2">
                                    <div
                                        className="h-4 rounded-r bg-indigo-600 transition-all duration-500"
                                        style={{ width: `${(item.current / maxValue) * 100}%` }}
                                    />
                                    <span className="text-[10px] text-gray-500 shrink-0">
                                        {(item.current / 1000).toFixed(0)}k
                                    </span>
                                </div>
                                {/* Previous */}
                                <div className="flex items-center gap-2">
                                    <div
                                        className="h-4 rounded-r bg-indigo-300 transition-all duration-500"
                                        style={{ width: `${(item.previous / maxValue) * 100}%` }}
                                    />
                                    <span className="text-[10px] text-gray-500 shrink-0">
                                        {(item.previous / 1000).toFixed(0)}k
                                    </span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    // Vertical bars
    return (
        <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-5 shadow-sm">
            {/* Header */}
            <div className="flex items-center justify-between mb-5">
                <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200">
                    {title}
                </h3>
                <div className="flex items-center gap-3 text-xs">
                    <span className="flex items-center gap-1">
                        <span className="w-2.5 h-2.5 rounded-sm bg-indigo-600"></span>
                        Atual
                    </span>
                    <span className="flex items-center gap-1">
                        <span className="w-2.5 h-2.5 rounded-sm bg-indigo-300"></span>
                        Anterior
                    </span>
                </div>
            </div>

            {/* Vertical Bars Chart */}
            <div className="flex items-end justify-between gap-2 h-[160px]">
                {data.map((item, idx) => {
                    const currentHeight = (item.current / maxValue) * 100;
                    const previousHeight = (item.previous / maxValue) * 100;

                    return (
                        <div key={idx} className="flex-1 flex flex-col items-center gap-1">
                            <div className="flex items-end gap-0.5 h-[140px]">
                                {/* Current bar */}
                                <div
                                    className="w-3 bg-indigo-600 rounded-t transition-all duration-300 hover:bg-indigo-500"
                                    style={{ height: `${currentHeight}%` }}
                                />
                                {/* Previous bar */}
                                <div
                                    className="w-3 bg-indigo-300 rounded-t transition-all duration-300 hover:bg-indigo-400"
                                    style={{ height: `${previousHeight}%` }}
                                />
                            </div>
                            <span className="text-[10px] text-gray-400 dark:text-gray-500">
                                {item.name}
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
