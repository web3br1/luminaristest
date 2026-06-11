'use client';

import React from 'react';
import { CollapsibleSidebar } from '../../shared/components/CollapsibleSidebar';
import { SortSelect, SortOption } from '../../category-views/shared/SortSelect';
import { useTranslation } from 'next-i18next';
import { Task } from '../../../../types/Task.types';
import { MdSearch, MdSort, MdPriorityHigh } from 'react-icons/md';

interface KanbanFilterSidebarProps {
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

export function KanbanFilterSidebar({
    query,
    setQuery,
    priorityFilter,
    setPriorityFilter,
    sortConfig,
    setSortConfig,
    tasks,
    stats
}: KanbanFilterSidebarProps) {
    const { t } = useTranslation(['common', 'database']);

    return (
        <CollapsibleSidebar
            title={t('common:filters', 'Filters')}
            storageKey="kanban-sidebar-collapsed"
            width={260}
        >
            {/* Search */}
            <div className="space-y-2">
                <label className="block text-[10px] font-black text-gray-400 dark:text-neutral-500 uppercase tracking-widest pl-1 flex items-center gap-1.5">
                    <MdSearch size={14} />
                    {t('common:search_label', 'Search')}
                </label>
                <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={t('common:search_placeholder', 'Search...')}
                    className="w-full px-3 py-2 text-xs font-bold rounded-xl bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 dark:focus:border-blue-400/50 text-gray-700 dark:text-white placeholder:text-gray-400/50 transition-all shadow-sm"
                />
            </div>

            {/* Sort */}
            <div className="space-y-2">
                <SortSelect
                    value={sortConfig}
                    onChange={setSortConfig}
                    records={tasks}
                    fieldLabels={{
                        name: t('database:fields.name', 'Nome'),
                        priority: t('database:fields.priority', 'Prioridade'),
                        status: t('database:fields.status', 'Status'),
                        createdAt: t('database:fields.createdAt', 'Data Criação'),
                    }}
                />
            </div>

            {/* Priority Filter */}
            <div className="space-y-2">
                <label className="block text-[10px] font-black text-gray-400 dark:text-neutral-500 uppercase tracking-widest pl-1 flex items-center gap-1.5">
                    <MdPriorityHigh size={14} />
                    {t('database:fields.priority', 'Prioridade')}
                </label>
                <div className="flex flex-col gap-1.5">
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
                                w-full text-left px-3 py-2 text-xs font-bold rounded-xl transition-all duration-200
                                ${priorityFilter === priority.id
                                    ? 'bg-blue-600 dark:bg-blue-500 text-white shadow-md shadow-blue-500/20 translate-x-1'
                                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-neutral-900 border border-transparent hover:border-gray-200 dark:hover:border-neutral-800'
                                }
                            `}
                        >
                            <div className="flex items-center gap-2">
                                {priority.color && <div className={`w-2 h-2 rounded-full ${priority.color} ${priorityFilter === priority.id ? 'bg-white' : ''}`} />}
                                {priority.label}
                            </div>
                        </button>
                    ))}
                </div>
            </div>

            {/* Quick Stats Footer */}
            <div className="pt-4 border-t border-gray-100 dark:border-neutral-800">
                <div className="grid grid-cols-2 gap-2 text-center">
                    <div className="bg-gray-50 dark:bg-neutral-800/50 rounded-xl p-2.5">
                        <p className="text-xl font-black text-gray-900 dark:text-white tracking-tighter">{stats.total}</p>
                        <p className="text-[9px] font-black text-gray-400 dark:text-neutral-500 uppercase tracking-widest">{t('common:kanban_view.total', 'Total')}</p>
                    </div>
                    <div className="bg-emerald-50 dark:bg-emerald-950/20 rounded-xl p-2.5">
                        <p className="text-xl font-black text-emerald-600 dark:text-emerald-400 tracking-tighter">{stats.done}</p>
                        <p className="text-[9px] font-black text-emerald-500/70 dark:text-emerald-500/50 uppercase tracking-widest">{t('common:kanban_view.done', 'Concluídas')}</p>
                    </div>
                </div>
            </div>
        </CollapsibleSidebar>
    );
}
