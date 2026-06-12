import Sparkline from './Sparkline';

interface KpiDetail {
    label: string;
    value: string;
}

interface DashboardKpiCardProps {
    title: string;
    value: string;
    change: string;
    trend: 'up' | 'down' | 'flat';
    details: KpiDetail[];
    isCurrency?: boolean;
    sparklineData?: number[];
    showGraph?: boolean;
}

/**
 * DashboardKpiCard - Individual KPI metric card
 * 
 * Features:
 * - Large value display
 * - Trend indicator with color
 * - Sparkline for historical visualization
 * - Expandable details section
 */
export default function DashboardKpiCard({
    title,
    value,
    change,
    trend,
    details,
    sparklineData,
    showGraph = true,
}: DashboardKpiCardProps) {
    const isPositive = !change.startsWith('-');
    const trendColor = trend === 'up'
        ? (isPositive ? 'text-emerald-500' : 'text-red-500')
        : (isPositive ? 'text-red-500' : 'text-emerald-500');

    return (
        <div className="bg-white dark:bg-neutral-900 rounded-2xl border border-gray-100 dark:border-gray-800 p-5 shadow-sm hover:shadow-md transition-shadow duration-200 flex flex-col h-full">
            {/* Header */}
            <div className="flex items-start justify-between mb-3">
                <h3 className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider">
                    {title}
                </h3>
            </div>

            {/* Main Value */}
            <div className="flex items-baseline gap-2 mb-2">
                <span className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight">
                    {value}
                </span>
                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${trend === 'up' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'} flex items-center gap-0.5`}>
                    {trend === 'up' ? '▲' : '▼'}
                    {change}
                </span>
            </div>

            {/* Sparkline Visual (Optional) */}
            {showGraph && (
                <div className="flex-1 min-h-[40px] flex items-center mb-4">
                    <Sparkline
                        data={sparklineData || []}
                        height={40}
                        showTrend={true}
                        color={trend === 'up' ? '#10b981' /* lumi-success */ : '#ef4444' /* lumi-danger */}
                    />
                </div>
            )}

            {/* Details */}
            <div className="space-y-1.5 pt-3 border-t border-gray-100 dark:border-gray-800">
                {details.map((detail, idx) => (
                    <div key={idx} className="flex items-center justify-between text-[11px]">
                        <span className="text-gray-400 dark:text-gray-500 font-medium">{detail.label}</span>
                        <span className="font-bold text-gray-600 dark:text-gray-300">
                            {detail.value}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}
