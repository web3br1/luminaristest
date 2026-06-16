'use client';

import { useState, useEffect, useCallback } from 'react';
import { FinanceService } from '../../services/FinanceService';
import type {
  AnalyticsPresetGroup,
  ChartData,
  UseAnalyticsDataOptions,
  UseAnalyticsDataReturn,
  ChartPreset,
  ChartDataPoint,
  DatePreset,
} from '../../types';


/**
 * Normalize API response to ChartData format
 */
function normalizeChartData(body: unknown): ChartData {
  const rootData = (body as { data?: unknown })?.data ?? body;

  // Direct array response
  if (Array.isArray(rootData)) {
    return { chart: null, data: rootData };
  }

  // Nested object response
  if (rootData && typeof rootData === 'object') {
    const rd = rootData as { chart?: ChartPreset; data?: ChartDataPoint[]; error?: string };
    if (Array.isArray(rd.data)) {
      return {
        chart: rd.chart ?? null,
        data: rd.data,
        error: rd.error,
      };
    }
    const b = body as { data?: { chart?: ChartPreset; data?: ChartDataPoint[]; error?: string } };
    if (Array.isArray(b?.data?.data)) {
      return {
        chart: b?.data?.chart ?? null,
        data: b?.data?.data,
        error: b?.data?.error,
      };
    }
    // Fallback: coerce object entries to name/value pairs
    const maybeArray = Object.entries(rootData).map(([name, value]) => ({
      name,
      value: typeof value === 'number' ? value : Number(value) || 0,
    }));
    return { chart: null, data: maybeArray };
  }

  return { chart: null, data: [] };
}

// =============================================================================
// HOOK
// =============================================================================

/**
 * useAnalyticsData - Custom hook to fetch and manage analytics data
 *
 * Features:
 * - Fetches preset groups on mount
 * - Fetches data for all charts in parallel
 * - Supports refetching individual charts with new params
 * - Handles loading and error states
 */
export function useAnalyticsData(
  options: UseAnalyticsDataOptions = {}
): UseAnalyticsDataReturn & { datePreset: DatePreset; setDatePreset: (p: DatePreset) => void } {
  const { presetKey } = options;

  const [datePreset, setDatePreset] = useState<DatePreset>('thisMonth');
  const [presetGroups, setPresetGroups] = useState<AnalyticsPresetGroup[]>([]);
  const [chartData, setChartData] = useState<Record<string, ChartData>>({});
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});

  /**
   * Fetch chart data for a specific chart key
   */
  const fetchChartData = useCallback(
    async (
      chartKey: string,
      extraParams?: Record<string, string>
    ) => {
      try {
        const body = await FinanceService.fetchChartData(chartKey, datePreset, presetKey, extraParams);
        const normalized = normalizeChartData(body);

        setChartData((prev) => ({ ...prev, [chartKey]: normalized }));

        if (normalized?.error) {
          setErrors((prev) => ({ ...prev, [chartKey]: normalized.error || '' }));
        }
      } catch (error: unknown) {
        console.error(`Error fetching chart data for ${chartKey}:`, error);
        setErrors((prev) => ({
          ...prev,
          [chartKey]: (error instanceof Error ? error.message : String(error)) || 'error_loading_data',
        }));
      }
    },
    [presetKey, datePreset]
  );

  /**
   * Refetch a specific chart with new parameters
   */
  const refetchChart = useCallback(
    async (chartKey: string, params?: Record<string, string>) => {
      try {
        await fetchChartData(chartKey, params);
      } catch (err) {
        console.error('Error refetching chart:', err);
      }
    },
    [fetchChartData]
  );

  /**
   * Discover KPIs for a specific table and add them to available presets
   */
  const discoverKPIs = useCallback(
    async (tableId: string) => {
      try {
        const body = await FinanceService.discoverKPIs(tableId, datePreset) as Record<string, unknown> | null;
        const discoveredGroups = Array.isArray((body as { data?: unknown })?.data) ? (body as { data: AnalyticsPresetGroup[] }).data : [];

        if (discoveredGroups.length > 0) {
          setPresetGroups((prev) => {
            // Remove previous discovered groups for this table to avoid duplicates
            const filtered = prev.filter(g => !g.key.startsWith(`discovered.${tableId}`));
            return [...filtered, ...discoveredGroups];
          });

          // Fetch data for the newly discovered charts
          const dataPromises: Promise<void>[] = [];
          for (const group of discoveredGroups) {
            for (const chart of group.charts) {
              dataPromises.push(fetchChartData(chart.key));
            }
          }
          await Promise.all(dataPromises);
        }
        return discoveredGroups;
      } catch (err) {
        console.error('Error discovering KPIs:', err);
        return [];
      }
    },
    [datePreset, fetchChartData]
  );

  /**
   * Fetch all analytics data on mount
   */
  useEffect(() => {
    async function fetchPresets() {
      try {
        setLoading(true);
        const search = new URLSearchParams({ datePreset });
        const url = presetKey
          ? `/analytics/presets/${encodeURIComponent(presetKey)}?${search.toString()}`
          : `/analytics/presets?${search.toString()}`;

        const body = await FinanceService.getCustomData(url) as Record<string, unknown> | null;
        const groups = Array.isArray((body as { data?: unknown })?.data) ? (body as { data: AnalyticsPresetGroup[] }).data : [];
        setPresetGroups(groups);

        // Fetch data for all charts in parallel
        const dataPromises: Promise<void>[] = [];
        for (const group of groups) {
          for (const chart of group.charts) {
            dataPromises.push(fetchChartData(chart.key));
          }
        }
        await Promise.all(dataPromises);
      } catch (error: unknown) {
        console.error('Error fetching analytics:', error);
        let errorMsg = 'error_loading_analytics';
        if (error instanceof Error) {
          errorMsg = error.message;
        } else if (error && typeof error === 'object') {
          errorMsg = (error as Record<string, unknown>)['error'] as string || (error as Record<string, unknown>)['message'] as string || String(error);
          if (errorMsg === '[object Object]') errorMsg = JSON.stringify(error);
        } else if (error) {
          errorMsg = String(error);
        }
        setErrors({ general: errorMsg });
      } finally {
        setLoading(false);
      }
    }

    fetchPresets();
  }, [presetKey, datePreset, fetchChartData]);

  return {
    presetGroups,
    chartData,
    loading,
    errors,
    refetchChart,
    discoverKPIs,
    datePreset,
    setDatePreset,
  };
}
