'use client';

import React from 'react';
import { useTranslation } from 'next-i18next';
import { MdSearch, MdOutlineDashboard, MdPriorityHigh } from 'react-icons/md';
import { FilterBar } from '../shared/components/FilterBar';
import { FilterGroup } from '../shared/components/FilterGroup';
import { SortSelect, SortOption } from '../shared/SortSelect';
import { Task } from '../../../../types/Task.types';

interface KanbanFilterBarProps {
    isOpen?: boolean;
    query: string;
    setQuery: (q: string) => void;
    priorityFilter: string;
    setPriorityFilter: (s: string) => void;
    sortConfig: SortOption | null;
    setSortConfig: (s: SortOption | null) => void;
    tasks: Task[];
    stats: {
        total: number;
        done: number;
        inProgress: number;
    };
}

export function KanbanFilterBar({
    isOpen = true,
    query,
    setQuery,
    priorityFilter,
    setPriorityFilter,
    sortConfig,
    setSortConfig,
    tasks,
    stats
}: KanbanFilterBarProps) {
    const { t } = useTranslation(['common', 'database']);

    return (
        <FilterBar isOpen={isOpen}>
            {/* Search */}
            <FilterGroup
                label={t('common:search_label', 'Search')}
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

            {/* Sort */}
            <SortSelect
                value={sortConfig}
                onChange={setSortConfig}
                records={tasks}
                variant="horizontal"
                fieldLabels={{
                    name: t('database:fields.name', 'Nome'),
                    priority: t('database:fields.priority', 'Prioridade'),
                    status: t('database:fields.status', 'Status'),
                    createdAt: t('database:fields.createdAt', 'Data Criação'),
                }}
            />

            {/* Priority Filter */}
            <FilterGroup
                label={t('database:fields.priority', 'Prioridade')}
                icon={<MdPriorityHigh size={14} />}
            >
                <div className="flex gap-1.5 min-w-[420px]">
                    {[
                        { id: '', label: t('common:all', 'Todas') },
                        { id: 'Low', label: t('database:options.Low', 'Low'), color: 'bg-blue-500' },
                        { id: 'Medium', label: t('database:options.Medium', 'Medium'), color: 'bg-yellow-500' },
                        { id: 'High', label: t('database:options.High', 'High'), color: 'bg-red-500' },
                        { id: 'Urgent', label: t('database:options.Urgent', 'Urgent'), color: 'bg-purple-500' },
                    ].map(priority => (
                        <button
                            key={priority.id}
                            onClick={() => setPriorityFilter(priority.id)}
                            className={`
                                flex-1 flex items-center justify-center gap-2 px-2.5 py-2 text-[10px] font-bold rounded-xl transition-all duration-200 border
                                ${priorityFilter === priority.id
                                    ? 'bg-blue-600 dark:bg-blue-500 text-white border-blue-700 shadow-md shadow-blue-500/20'
                                    : 'text-gray-600 dark:text-gray-400 bg-white dark:bg-neutral-900 border-gray-100 dark:border-neutral-800 hover:border-blue-200 dark:hover:border-neutral-700'
                                }
                            `}
                        >
                            {priority.color && <div className={`w-1.5 h-1.5 rounded-full ${priority.color} ${priorityFilter === priority.id ? 'bg-white' : ''}`} />}
                            {priority.label}
                        </button>
                    ))}
                </div>
            </FilterGroup>

            {/* Stats Footer (Horizontal) */}
            <div className="ml-auto pl-6 border-l border-gray-100 dark:border-neutral-800 flex items-center gap-6">
                <div className="flex flex-col items-center">
                    <span className="text-[10px] font-black text-gray-400 dark:text-neutral-500 uppercase tracking-widest leading-none">
                        {t('common:kanban_view.total', 'Total')}
                    </span>
                    <span className="text-lg font-black text-gray-900 dark:text-white leading-none mt-1">
                        {stats.total}
                    </span>
                </div>
                <div className="flex flex-col items-center">
                    <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest leading-none">
                        {t('common:kanban_view.done', 'Concluídas')}
                    </span>
                    <span className="text-lg font-black text-emerald-600 dark:text-emerald-400 leading-none mt-1">
                        {stats.done}
                    </span>
                </div>
            </div>
        </FilterBar>
    );
}

export default KanbanFilterBar;
