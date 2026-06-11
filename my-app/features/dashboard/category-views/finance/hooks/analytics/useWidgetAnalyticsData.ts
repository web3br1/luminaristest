'use client';

import { useState, useEffect } from 'react';

import { FinanceService } from '../../services/FinanceService';
import type {
  AnalyticsPresetGroup,
  ChartData,
  UseAnalyticsDataOptions,
  ChartPreset,
  ChartDataPoint,
  DatePreset,
} from '../../types';



function normalizeChartData(body: unknown): ChartData {
  const rootData = (body as { data?: unknown })?.data ?? body;
  if (Array.isArray(rootData)) return { chart: null, data: rootData };
  if (rootData && typeof rootData === 'object') {
    const rd = rootData as { chart?: ChartPreset; data?: ChartDataPoint[]; error?: string };
    if (Array.isArray(rd.data)) return { chart: rd.chart ?? null, data: rd.data, error: rd.error };
    const b = body as { data?: { chart?: ChartPreset; data?: ChartDataPoint[]; error?: string } };
    if (Array.isArray(b?.data?.data)) return { chart: b?.data?.chart ?? null, data: b?.data?.data, error: b?.data?.error };
    const maybeArray = Object.entries(rootData).map(([name, value]) => ({
      name,
      value: typeof value === 'number' ? value : Number(value) || 0,
    }));
    return { chart: null, data: maybeArray };
  }
  return { chart: null, data: [] };
}

interface UseWidgetAnalyticsDataOptions extends UseAnalyticsDataOptions {
  chartKey?: string; // If provided, fetches data for this chart
}

/**
 * Super-lightweight hook for single Dashboard Widgets.
 * Does NOT fetch all charts. Fetches only the presets, and the specifically requested chart.
 */
export function useWidgetAnalyticsData(options: UseWidgetAnalyticsDataOptions = {}) {
  const { presetKey, chartKey } = options;


  const [datePreset, setDatePreset] = useState<DatePreset>('thisMonth');
  const [presetGroups, setPresetGroups] = useState<AnalyticsPresetGroup[]>([]);
  const [chartData, setChartData] = useState<ChartData | null>(null);
  
  const [loadingPresets, setLoadingPresets] = useState(true);
  const [loadingData, setLoadingData] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch presets metadata on mount
  useEffect(() => {
    const abortController = new AbortController();

    async function fetchPresets() {
      try {
        setLoadingPresets(true);
        const search = new URLSearchParams({ datePreset });
        const url = presetKey
          ? `/analytics/presets/${encodeURIComponent(presetKey)}?${search.toString()}`
          : `/analytics/presets?${search.toString()}`;

        const body = await FinanceService.getCustomData(url);
        if (abortController.signal.aborted) return;
        setPresetGroups(Array.isArray(body?.data) ? body.data : []);
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') return;
        setError(err instanceof Error ? err.message : 'error_loading_presets');
      } finally {
        setLoadingPresets(false);
      }
    }

    fetchPresets();
    return () => abortController.abort();
  }, [presetKey, datePreset]);

  // Fetch actual graph data only when chartKey is defined
  useEffect(() => {
    if (!chartKey) {
      setChartData(null);
      return;
    }

    const abortController = new AbortController();

    async function fetchData() {
      try {
        setLoadingData(true);
        const body = await FinanceService.fetchChartData(chartKey as string, datePreset, presetKey);
        if (abortController.signal.aborted) return;
        const normalized = normalizeChartData(body);
        setChartData(normalized);
        if (normalized.error) {
          setError(normalized.error);
        } else {
          setError(null);
        }
      } catch (err: unknown) {
        if (err instanceof Error && err.name === 'AbortError') return;
        setError(err instanceof Error ? err.message : 'error_loading_chart_data');
        setChartData({ chart: null, data: [] });
      } finally {
        setLoadingData(false);
      }
    }

    fetchData();
    return () => abortController.abort();
  }, [chartKey, presetKey, datePreset]);

  return {
    presetGroups,
    chartData,
    loadingPresets,
    loadingData,
    error,
    datePreset,
    setDatePreset,
  };
}
