'use client';

import React, { useMemo } from 'react';
import { useTranslation } from 'next-i18next';
import { FilterBar } from '../../shared/components/FilterBar';
import { FilterGroup } from '../../shared/components/FilterGroup';
import { MdSearch } from 'react-icons/md';
import type { SortOption } from '../../shared/SortSelect';
import { SortSelect } from '../../shared/SortSelect';
import { getSchemaAllowedSortFields } from '../../shared/utils/sortUtils';

interface PlanningFilterBarProps {
    isOpen?: boolean;
    eventCounts: { scheduled: number; completed: number; noShow: number; cancelled: number };
    totalEvents: number;
    query: string;
    setQuery: (q: string) => void;
    statusFilter: string | null;
    setStatusFilter: (s: string | null) => void;
    sortConfig: SortOption | null;
    setSortConfig: (s: SortOption | null) => void;
    records?: { id: string; data?: Record<string, unknown> }[];
    schema?: { fields?: { name: string; label?: string; type?: string }[] } | null;
}

export function PlanningFilterBar({
    isOpen = true,
    eventCounts,
    totalEvents,
    query,
    setQuery,
    statusFilter,
    setStatusFilter,
    sortConfig,
    setSortConfig,
    records,
    schema
}: PlanningFilterBarProps) {
    const { t } = useTranslation(['common', 'database']);

    const fieldLabels = useMemo<Record<string, string>>(() => {
        if (!schema?.fields || !Array.isArray(schema.fields)) return {};
        return Object.fromEntries(
            schema.fields.map(f => [f.name, f.label || f.name])
        );
    }, [schema]);

    const allowedFields = useMemo(
        () => getSchemaAllowedSortFields(schema),
        [schema]
    );

    return (
        <FilterBar isOpen={isOpen}>
            <div className="flex flex-col md:flex-row md:items-center gap-6 w-full py-1">
                {/* Search Input */}
                <FilterGroup
                    label={t('common:search', 'Buscar')}
                    icon={<MdSearch size={14} />}
                    className="flex-[1.5]"
                >
                    <input
                        type="text"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder={t('common:search_placeholder', 'Search...')}
                        className="w-full px-3 py-2 text-xs font-bold rounded-xl bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 dark:focus:border-blue-400/50 text-gray-700 dark:text-white placeholder:text-gray-400/50 transition-all shadow-sm"
                    />
                </FilterGroup>

                <div className="h-8 w-px bg-gray-200 dark:bg-neutral-800 hidden md:block" />

                <SortSelect
                    value={sortConfig}
                    onChange={setSortConfig}
                    records={records ?? []}
                    fieldLabels={fieldLabels}
                    allowedFields={allowedFields}
                />

                <div className="h-8 w-px bg-gray-200 dark:bg-neutral-800 hidden md:block" />

                {/* Stats Summary & Status Filters */}
                <div className="flex items-center gap-4">
                    <div
                        onClick={() => setStatusFilter(null)}
                        className={`flex flex-col cursor-pointer hover:opacity-80 transition-opacity ${!statusFilter ? 'opacity-100' : 'opacity-40'}`}
                    >
                        <span className="text-[10px] text-gray-500 dark:text-gray-400 uppercase tracking-wider font-bold">
                            {t('common:total_events', 'Total')}
                        </span>
                        <span className="text-sm font-black text-gray-900 dark:text-white leading-none text-center">
                            {totalEvents}
                        </span>
                    </div>

                    <div className="h-8 w-px bg-gray-200 dark:bg-neutral-800 hidden sm:block mx-1" />

                    <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
                        <StatBadge
                            label={t('common:status.scheduled', 'Agendados')}
                            count={eventCounts.scheduled}
                            colorClass="bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400 border-blue-100/50"
                            isActive={statusFilter === 'Scheduled'}
                            onClick={() => setStatusFilter(statusFilter === 'Scheduled' ? null : 'Scheduled')}
                        />
                        <StatBadge
                            label={t('common:status.completed', 'Concluídos')}
                            count={eventCounts.completed}
                            colorClass="bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400 border-emerald-100/50"
                            isActive={statusFilter === 'Completed'}
                            onClick={() => setStatusFilter(statusFilter === 'Completed' ? null : 'Completed')}
                        />
                        <StatBadge
                            label={t('common:status.no_show', 'No-Show')}
                            count={eventCounts.noShow}
                            colorClass="bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400 border-amber-100/50"
                            isActive={statusFilter === 'No-Show'}
                            onClick={() => setStatusFilter(statusFilter === 'No-Show' ? null : 'No-Show')}
                        />
                        <StatBadge
                            label={t('common:status.cancelled', 'Cancelados')}
                            count={eventCounts.cancelled}
                            colorClass="bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-400 border-rose-100/50"
                            isActive={statusFilter === 'Cancelled'}
                            onClick={() => setStatusFilter(statusFilter === 'Cancelled' ? null : 'Cancelled')}
                        />
                    </div>
                </div>

                {/* Legend / Info */}
                <div className="ml-auto hidden xl:flex items-center gap-4 px-4 border-l border-gray-100 dark:border-neutral-800">
                    <div className="flex items-center gap-2 text-[10px] font-bold text-gray-400">
                        <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                        <span>{t('common:status.scheduled', 'Agendado')}</span>
                    </div>
                    <div className="flex items-center gap-2 text-[10px] font-bold text-gray-400">
                        <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                        <span>{t('common:status.completed', 'Concluído')}</span>
                    </div>
                </div>
            </div>
        </FilterBar>
    );
}

function StatBadge({
    label,
    count,
    colorClass,
    isActive,
    onClick
}: {
    label: string;
    count: number;
    colorClass: string;
    isActive: boolean;
    onClick: () => void;
}) {
    return (
        <button
            onClick={onClick}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border transition-all ${colorClass} ${isActive ? 'ring-2 ring-offset-2 ring-blue-500 dark:ring-offset-black opacity-100 scale-105 border-transparent shadow-sm' : 'opacity-40 hover:opacity-100 border-transparent'}`}
        >
            <span className="text-sm font-black">{count}</span>
            <span className="text-[10px] font-bold uppercase tracking-tight opacity-70 whitespace-nowrap">{label}</span>
        </button>
    );
}
