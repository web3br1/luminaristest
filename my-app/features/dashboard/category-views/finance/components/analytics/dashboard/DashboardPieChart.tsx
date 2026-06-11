'use client';

import React from 'react';

interface CategoryDataPoint {
    name: string;
    value: number;
    count: number;
    color: string;
}

interface DashboardPieChartProps {
    title: string;
    data: CategoryDataPoint[];
}

/**
 * DashboardPieChart - Donut chart with legend for category distribution
 * 
 * CSS-only donut chart using conic-gradient
 */
export default function DashboardPieChart({
    title,
    data,
}: DashboardPieChartProps) {
    // Calculate cumulative percentages for conic-gradient
    let cumulative = 0;
    const segments = data.map(item => {
        const start = cumulative;
        cumulative += item.value;
        return { ...item, start, end: cumulative };
    });

    // Build conic-gradient string
    const gradientStops = segments
        .map(seg => `${seg.color} ${seg.start}% ${seg.end}%`)
        .join(', ');

    return (
        <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-5 shadow-sm h-full">
            {/* Header */}
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-6">
                {title}
            </h3>

            {/* Chart + Legend */}
            <div className="flex flex-col items-center">
                {/* Donut Chart */}
                <div className="relative mb-6">
                    <div
                        className="w-36 h-36 rounded-full"
                        style={{
                            background: `conic-gradient(${gradientStops})`,
                        }}
                    />
                    {/* Center hole */}
                    <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-20 h-20 rounded-full bg-white dark:bg-neutral-900" />
                    </div>
                </div>

                {/* Legend */}
                <div className="w-full space-y-2.5">
                    {data.map((item, idx) => (
                        <div key={idx} className="flex items-center justify-between gap-3">
                            <div className="flex items-center gap-2 min-w-0">
                                <span
                                    className="w-2.5 h-2.5 rounded-full shrink-0"
                                    style={{ backgroundColor: item.color }}
                                />
                                <span className="text-sm text-gray-600 dark:text-gray-300 truncate">
                                    {item.name}
                                </span>
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                                <span className="text-sm font-semibold text-gray-900 dark:text-white">
                                    {item.value}%
                                </span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
