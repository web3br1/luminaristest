/**
 * PieDonutChart Component
 *
 * Renders pie or donut charts using Recharts.
 * Extracted from ChartRenderer for better code organization.
 */

import React, { useMemo } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import type { ChartDataPoint } from '../../../types/analytics.types';
import { useTheme } from '@/lib/hooks/useTheme';
import { getTooltipStyles } from '../../../utils/chartConstants';
import { formatCompactNumber } from '../../../utils/kpiHelpers';
import { useFormatCurrency } from '@/lib/context/CurrencyContext';

export interface PieDonutChartProps {
  data: ChartDataPoint[];
  title: string;
  isDonut: boolean;
  colors: string[];
  currency?: string;
  metricLabel?: string;
  labelMap?: Record<string, string>;
  isComposition?: boolean;
}



/**
 * PieDonutChart - Renders pie or donut charts
 */
export default function PieDonutChart({
  data,
  title,
  isDonut,
  colors,
  currency,
  metricLabel,
  labelMap = {},
  isComposition = false,
}: PieDonutChartProps) {
  const { theme } = useTheme();
  const formatCurrency = useFormatCurrency();

  /**
   * Format value for tooltip/axis
   */
  const formatValue = (value: number, useCurrency?: string) => {
    if (useCurrency) {
      return formatCurrency(value);
    }
    return value.toLocaleString('pt-BR');
  };

  const isDark = theme === 'dark';
  const tooltipStyles = getTooltipStyles(isDark);

  // Apply labelMap to transform boolean/raw values to readable labels
  const mappedData = useMemo(() => {
    return data.map((point) => ({
      ...point,
      name: labelMap[point.name] || labelMap[String(point.name)] || point.name,
    }));
  }, [data, labelMap]);

  // For composition charts, include all groups (even with 0 value) for proper comparison
  // Otherwise, filter out zero values
  const arcData = useMemo(() => {
    return isComposition
      ? mappedData // Include all, even zeros
      : mappedData.filter((d) => d.value > 0);
  }, [mappedData, isComposition]);

  const showLabels = arcData.length > 1;
  const total = useMemo(
    () => mappedData.reduce((s, d) => s + (d.value || 0), 0),
    [mappedData]
  );
  const single = arcData.length === 1 && arcData[0].value > 0 ? arcData[0] : null;

  // Build legend entries
  const legendItems = useMemo(() => {
    return arcData.map((d, idx) => ({
      label: d.name,
      value: d.value,
      color: colors[idx % colors.length],
    }));
  }, [arcData, colors]);

  return (
    <div className="rounded-xl border border-gray-200/70 dark:border-gray-800/70 bg-white dark:bg-neutral-900 p-4">
      <div className="mb-1">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
          {title}
        </h3>
        {metricLabel && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{metricLabel}</p>
        )}
      </div>
      <div className="h-64 relative">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={arcData}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={false}
              outerRadius={isDonut ? 80 : 100}
              innerRadius={isDonut ? 44 : 0}
              fill="#8884d8"
              dataKey="value"
              nameKey="name"
              stroke="#111827" /* lumi-text */
              strokeOpacity={0.08}
            >
              {arcData.map((_, index) => (
                <Cell key={`cell-${index}`} fill={colors[index % colors.length]} />
              ))}
            </Pie>
            <Tooltip
              formatter={(value: number) => formatValue(value, currency)}
              contentStyle={tooltipStyles}
              itemStyle={{
                color: isDark ? '#111827' /* lumi-text */ : '#f3f4f6' /* lumi-surface */,
                padding: '2px 0',
              }}
              labelStyle={{
                color: isDark ? '#111827' /* lumi-text */ : '#f3f4f6' /* lumi-surface */,
                fontWeight: 600,
                marginBottom: '4px',
                display: 'none',
              }}
            />
          </PieChart>
        </ResponsiveContainer>
        {!showLabels && single && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center text-sm text-gray-700 dark:text-gray-200">
              <div className="font-semibold">
                {formatValue(single.value, currency)}
              </div>
              <div className="text-xs">
                {total > 0 ? `${((single.value / total) * 100).toFixed(0)}%` : '0%'}
              </div>
            </div>
          </div>
        )}
      </div>
      {/* Custom legend */}
      <div className="mt-3 grid grid-cols-2 gap-2">
        {legendItems.map((it, idx) => (
          <div
            key={idx}
            className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300"
          >
            <span
              className="inline-block w-3 h-3 rounded-sm flex-shrink-0"
              style={{ backgroundColor: it.color }}
            />
            <span className="truncate">{it.label}</span>
            <span className="ml-auto tabular-nums">
              {formatValue(it.value, currency)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}





