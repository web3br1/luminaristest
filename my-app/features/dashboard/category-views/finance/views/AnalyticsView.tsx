'use client';

import React, { useState } from 'react';

import { AnalyticsDashboard, MasterDetailDashboard } from '../components/analytics';
import type { AnalyticsViewProps } from '../types/analytics.types';


interface ExtendedAnalyticsViewProps extends AnalyticsViewProps {
    isWidgetMode?: boolean;
    viewModeOverride?: 'spreadsheets' | 'dashboard';
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

/**
 * AnalyticsView - Main component for displaying analytics dashboards
 *
 * Features:
 * - Toggle between Spreadsheets (Master-Detail) and Dashboard views
 * - Spreadsheets: Causal-style KPI explorer with resizable sidebar
 * - Dashboard: Visual dashboard with KPI cards and charts
 */
export function AnalyticsView({ presetKey, tables, isWidgetMode = false, viewModeOverride }: ExtendedAnalyticsViewProps) {

    // Visualization mode state
    const [localViewMode, setLocalViewMode] = useState<'spreadsheets' | 'dashboard'>(isWidgetMode ? 'dashboard' : 'spreadsheets');
    const viewMode = viewModeOverride || localViewMode;

    return (
        <div className="flex flex-col h-full bg-gray-50 dark:bg-black">
            {/* Content based on view mode - Scroll safe flex-1 area */}
            <div className={`flex-1 min-h-0 overflow-auto custom-scrollbar ${viewMode === 'spreadsheets' ? '' : 'p-4 md:p-6 lg:p-8'}`}>
                {viewMode === 'spreadsheets' ? (
                    /* Spreadsheets View - Master-Detail Layout */
                    <MasterDetailDashboard presetKey={presetKey} tables={tables?.map(t => ({ id: t.id, name: t.name, key: t.key || '' }))} />
                ) : (
                    /* Dashboard View - Visual Layout */
                    <AnalyticsDashboard presetKey={presetKey} tables={tables?.map(t => ({ id: t.id, name: t.name, key: t.key || '' }))} />
                )}
            </div>
        </div>
    );
}
