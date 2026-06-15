'use client';

import React from 'react';
import { useTranslation } from 'next-i18next';
import { DndContext, closestCenter, DragOverlay, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import type { Task } from '../../../../types/Task.types';
import type { IDynamicTable } from '../../components/shared/dynamic-tables.client';
import KanbanColumn from './KanbanColumn';
import KanbanTaskCard from './KanbanTaskCard';
import { useKanbanLogic } from './hooks/useKanbanLogic';
import { KanbanFilterBar } from './KanbanFilterBar';
import { MdOutlineDashboard } from 'react-icons/md';
import FloatingActionButton from '../../components/shared/FloatingActionButton';
import { KanbanCardDetailModal } from './components/KanbanCardDetailModal';
import { useRelationLookups } from './hooks/useRelationLookups';
import { EmptyState } from '../../shared/components/EmptyState';
import CategoryHeader from '../shared/components/CategoryHeader';
import CategoryTabs from '../shared/components/CategoryTabs';
import { useFilterPersistence } from '../shared/hooks/useFilterPersistence';

interface InternalKanbanViewProps {
    tables: IDynamicTable[];
    tasks: Task[];
    activeTabId: string;
    setActiveTabId: (id: string) => void;
    schemaByTableId: Record<string, unknown>;
    isLoading: boolean;
    error: Error | null;
    refetch: () => void;
}

export function InternalKanbanView({
    tables,
    tasks,
    activeTabId,
    setActiveTabId,
    schemaByTableId,
    isLoading,
    error,
    refetch
}: InternalKanbanViewProps) {
    const { t } = useTranslation(['common', 'database']);
    const activeTable = tables.find(t => t.id === activeTabId);
    const activeSchema = schemaByTableId[activeTabId];

    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: {
                distance: 8,
            },
        })
    );

    const {
        query, setQuery,
        priorityFilter, setPriorityFilter,
        sortConfig, setSortConfig,
        filteredTasks,
        columns,
        activeTask,
        handleDragStart,
        handleDragEnd,
        tabStats,
        handleTabChange
    } = useKanbanLogic({
        tasks,
        activeTabId,
        schema: activeSchema,
        onTabChangeCallback: setActiveTabId,
        refetch
    });

    const { isOpen: isFilterOpen, toggle: toggleFilter } = useFilterPersistence('kanban', false);
    const activeFiltersCount = React.useMemo(() => {
        let count = 0;
        if (query) count++;
        if (priorityFilter && priorityFilter !== '') count++;
        return count;
    }, [query, priorityFilter]);

    const { lookups: relationLookups } = useRelationLookups(activeSchema);

    const [selectedTask, setSelectedTask] = React.useState<Task | null>(null);
    const [isDetailModalOpen, setIsDetailModalOpen] = React.useState(false);

    const handleTaskClick = React.useCallback((task: Task) => {
        setSelectedTask(task);
        setIsDetailModalOpen(true);
    }, []);

    if (isLoading && tasks.length === 0) {
        return (
            <div className="flex flex-col flex-1 bg-white dark:bg-neutral-900 border border-gray-100 dark:border-neutral-800 rounded-2xl shadow-sm m-4 overflow-hidden">
                <div className="flex items-center justify-center h-full">
                    <div className="flex flex-col items-center gap-3">
                        <div className="w-8 h-8 border-2 border-blue-600/30 border-t-blue-600 rounded-full animate-spin" />
                        <span className="text-xs font-bold text-gray-400 uppercase tracking-widest">{t('loading', 'Carregando...')}</span>
                    </div>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="text-center p-12 bg-red-50 dark:bg-red-950/20 rounded-xl m-4 border border-red-100 dark:border-red-900/30">
                <p className="text-red-600 dark:text-red-400 font-bold">{t('common:error_loading_data')}</p>
                <p className="text-red-500 dark:text-red-500/70 text-sm mt-1">{error}</p>
            </div>
        );
    }

    if (tables.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-full p-12">
                <EmptyState
                    icon={<MdOutlineDashboard size={64} />}
                    title={t('database:kanban_view.no_results', 'Nenhum Quadro Encontrado')}
                    description={t('database:kanban_view.install_module', 'Inicie uma tabela com a categoria "kanban" para visualizar seus cartões.')}
                />
            </div>
        );
    }

    return (
        <div className="flex h-full w-full bg-gray-50 dark:bg-black overflow-hidden relative font-sans flex-col">
            <CategoryHeader
                title={t('common:kanban_view.title', 'Kanban')}
                icon={<MdOutlineDashboard size={20} />}
                iconBgClass="bg-blue-600 shadow-blue-500/20"
                portalId="kanban-actions-portal"
                filterProps={{
                    isOpen: isFilterOpen,
                    onToggle: toggleFilter,
                    activeCount: activeFiltersCount
                }}
            >
                {activeTable?.id && activeSchema && (
                    <FloatingActionButton
                        tableId={activeTable.id}
                        tableSchema={activeSchema}
                        onSuccess={refetch}
                        modalTitle={t('common:kanban_view.register_new_task', 'Cadastrar Nova Tarefa')}
                        themeColor="bg-blue-600"
                    >
                        <span className="text-sm font-bold">{t('common:kanban_view.new_task', 'Nova Tarefa')}</span>
                    </FloatingActionButton>
                )}
            </CategoryHeader>

            {/* Horizontal Filter Bar */}
            <KanbanFilterBar
                isOpen={isFilterOpen}
                query={query}
                setQuery={setQuery}
                priorityFilter={priorityFilter}
                setPriorityFilter={setPriorityFilter}
                sortConfig={sortConfig}
                setSortConfig={setSortConfig}
                tasks={filteredTasks}
                stats={{
                    total: tabStats.total,
                    done: tabStats.done,
                    inProgress: tabStats.inProgress
                }}
            />

            <main className="flex-1 flex flex-col min-w-0 overflow-hidden bg-white dark:bg-neutral-950 transition-colors">
                {/* Tabs Navigation (Separated from Header) */}
                {!isLoading && tables.length > 0 && (
                    <CategoryTabs
                        tabs={tables.map(table => ({
                            id: table.id,
                            label: t(`database:tables.${table.internalName}`, table.name) as string,
                            icon: MdOutlineDashboard,
                            count: tabStats.byTable[table.id] || 0
                        }))}
                        activeTabId={activeTabId}
                        onTabChange={handleTabChange}
                        colorTheme="blue"
                    />
                )}

                {/* Content: Kanban Board */}
                <div className="flex-1 overflow-hidden bg-gray-50/20 dark:bg-neutral-950/20">
                    {isLoading ? (
                        <div className="flex flex-col items-center justify-center h-full space-y-3">
                            <div className="w-8 h-8 border-2 border-blue-600/30 border-t-blue-600 rounded-full animate-spin" />
                            <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                                {t('common:kanban_view.loading', 'Carregando dados...')}
                            </p>
                        </div>
                    ) : (
                        <DndContext
                            sensors={sensors}
                            collisionDetection={closestCenter}
                            onDragStart={handleDragStart}
                            onDragEnd={handleDragEnd}
                        >
                            <div
                                className="h-full flex gap-6 overflow-x-auto p-6 custom-scrollbar"
                            >
                                {columns.map(column => (
                                    <div key={column.status} className="flex-1 min-w-[320px] max-w-[450px]">
                                        <KanbanColumn
                                            id={column.status}
                                            title={column.title}
                                            tasks={filteredTasks.filter(task => task.status === column.status)}
                                            table={activeTable!}
                                            onSuccess={refetch}
                                            onTaskClick={handleTaskClick}
                                            relationLookups={relationLookups}
                                        />
                                    </div>
                                ))}
                            </div>
                            <DragOverlay>
                                {activeTask && activeTable ? (
                                    <div className="opacity-9 relative z-50 transform rotate-2 pointer-events-none">
                                        <KanbanTaskCard
                                            task={activeTask}
                                            isOverlay
                                            tableId={activeTable.id}
                                            tableSchema={activeSchema}
                                            onSuccess={refetch}
                                            relationLookups={relationLookups}
                                        />
                                    </div>
                                ) : null}
                            </DragOverlay>
                        </DndContext>
                    )}
                    {/* Task Detail Modal */}
                    {selectedTask && (
                        <KanbanCardDetailModal
                            isOpen={isDetailModalOpen}
                            onClose={() => setIsDetailModalOpen(false)}
                            task={selectedTask}
                            tableId={activeTabId}
                            tableSchema={activeSchema}
                            onUpdate={refetch}
                            columnTitle={columns.find(c => c.status === selectedTask.status)?.title}
                            relationLookups={relationLookups}
                        />
                    )}
                </div>
            </main>
        </div>
    );
}

export default InternalKanbanView;

