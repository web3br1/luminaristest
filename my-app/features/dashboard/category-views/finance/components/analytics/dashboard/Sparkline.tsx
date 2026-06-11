'use client';

import React from 'react';

interface SparklineProps {
    data: number[];
    color?: string;
    height?: number;
    showTrend?: boolean;
}

/**
 * Sparkline - CSS-only mini chart component
 * 
 * Renders a compact bar chart without axes or labels.
 * Perfect for showing trends in list/card views.
 */
export default function Sparkline({
    data,
    color = '#6366f1',
    height = 32,
    showTrend = false
}: SparklineProps) {
    if (!data || data.length === 0) {
        return (
            <div
                className="flex items-center justify-center text-gray-400 text-xs"
                style={{ height }}
            >
                Sem dados
            </div>
        );
    }

    const max = Math.max(...data);
    const min = Math.min(...data);
    const range = max - min;

    // If there is absolutely no variation (all values are identical),
    // a trend graph is useless (like a flat line of 0s or 1500s).
    if (range === 0) {
        return <div className="flex-1 min-h-[40px] mb-4"></div>;
    }

    // Calculate trend
    const trend = showTrend && data.length >= 2
        ? data[data.length - 1] - data[0]
        : 0;

    // Determine color based on trend if showTrend is enabled

    const barColor = showTrend
        ? trend > 0
            ? '#10b981' // emerald-500
            : trend < 0
                ? '#ef4444' // red-500
                : color
        : color;

    return (
        <div
            className="flex items-end gap-[2px] w-full"
            style={{ height }}
        >
            {data.map((value, index) => {
                const normalizedHeight = ((value - min) / range) * 100;
                const isLast = index === data.length - 1;

                return (
                    <div
                        key={index}
                        className={`
              flex-1 rounded-t-sm transition-all duration-200
              ${isLast ? 'opacity-100' : 'opacity-70'}
            `}
                        style={{
                            height: `${Math.max(normalizedHeight, 8)}%`,
                            backgroundColor: barColor,
                            minHeight: '2px'
                        }}
                    />
                );
            })}
        </div>
    );
}
