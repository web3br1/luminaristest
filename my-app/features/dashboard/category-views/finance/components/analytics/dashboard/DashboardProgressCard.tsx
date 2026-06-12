import React from 'react';

interface DashboardProgressCardProps {
    title: string;
    value: string;
    numericValue: number; // 0 to 100
    change?: string;
    trend?: 'up' | 'down' | 'flat';
    higherIsBetter?: boolean;
    color?: string;
}

/**
 * DashboardProgressCard - Simple horizontal progress bar KPI card
 */
export default function DashboardProgressCard({
    title,
    value,
    numericValue,
    change,
    trend,
    higherIsBetter = true,
    color = '#6366f1', // lumi-secondary
}: DashboardProgressCardProps) {
    const isDark = typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    return (
        <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-5 shadow-sm hover:shadow-md transition-shadow duration-200 flex flex-col h-full">
            {/* Header */}
            <div className="flex items-start justify-between mb-3">
                <h3 className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                    {title}
                </h3>
            </div>

            {/* Value & Change */}
            <div className="flex items-baseline justify-between mb-4">
                <span className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight">
                    {value}
                </span>
                {change && (
                     <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${trend === 'up' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'} flex items-center gap-0.5`}>
                        {trend === 'up' ? '▲' : '▼'}
                        {change}
                    </span>
                )}
            </div>

            {/* Progress Bar Visual */}
            <div className="flex-1 flex flex-col justify-center">
                <div className="w-full h-3 bg-gray-100 dark:bg-neutral-800 rounded-full overflow-hidden">
                    <div 
                        className="h-full transition-all duration-1000 ease-out"
                        style={{ 
                            width: `${Math.min(100, Math.max(0, numericValue))}%`,
                            backgroundColor: color 
                        }}
                    />
                </div>
                <div className="flex justify-between mt-2 text-[10px] text-gray-400 dark:text-gray-500 font-medium">
                    <span>0%</span>
                    <span>100%</span>
                </div>
            </div>
        </div>
    );
}
