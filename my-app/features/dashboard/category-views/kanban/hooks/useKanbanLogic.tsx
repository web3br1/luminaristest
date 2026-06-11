'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { DragEndEvent, DragStartEvent } from '@dnd-kit/core';
import { DynamicTableService } from '../../../../../lib/services/dynamic-table.service';
import { arrayMove } from '@dnd-kit/sortable';
import { SortOption, sortRecords } from '../../shared/SortSelect';
import type { Task, TaskStatus } from '../../../../../types/Task.types';

interface UseKanbanLogicProps {
    tasks: Task[];
    activeTabId: string;
    schema: any; // Schema of the active table
    onTabChangeCallback?: (tabId: string) => void;
    refetch: () => void;
}

export function useKanbanLogic({ tasks, activeTabId, schema, onTabChangeCallback, refetch }: UseKanbanLogicProps) {
    // --- State ---
    const [query, setQuery] = useState('');
    const [priorityFilter, setPriorityFilter] = useState('');
    const [sortConfig, setSortConfig] = useState<SortOption | null>(null);
    const [activeTask, setActiveTask] = useState<Task | null>(null);

    // Optimistic UI state for tasks
    const [localTasks, setLocalTasks] = useState<Task[]>([]);

    // Sync local tasks when props change
    useEffect(() => {
        setLocalTasks(tasks);
    }, [tasks]);

    // --- Columns Extraction ---
    const columns = useMemo(() => {
        let cols: { title: string; status: string }[] = [];
        const statusField = schema?.fields?.find((f: any) => f.name === 'status');

        if (statusField && statusField.type === 'select' && statusField.options && statusField.options.length > 0) {
            cols = statusField.options.map((option: any) => {
                if (typeof option === 'string') { return { title: option, status: option }; }
                return { title: option.label, status: option.value };
            });
        } else {
            // Fallback: extract unique from current active tab tasks
            const tabTasks = localTasks.filter(t => t.dynamicTableId === activeTabId);
            const uniqueStatuses = Array.from(new Set(tabTasks.map(r => r.status).filter(Boolean)));
            if (uniqueStatuses.length > 0) {
                cols = uniqueStatuses.map(status => ({ title: String(status), status: String(status) }));
            } else {
                cols = [
                    { title: 'To Do', status: 'todo' },
                    { title: 'In Progress', status: 'in_progress' },
                    { title: 'Done', status: 'done' }
                ];
            }
        }
        return cols;
    }, [schema, localTasks, activeTabId]);

    // --- Filters ---
    const filteredTasks = useMemo(() => {
        let result = localTasks.filter(t => t.dynamicTableId === activeTabId);

        if (query.trim()) {
            const q = query.toLowerCase();
            result = result.filter(t => t.name.toLowerCase().includes(q) || (t.description && t.description.toLowerCase().includes(q)));
        }

        if (priorityFilter) {
            result = result.filter(t => t.priority === priorityFilter);
        }

        result = sortRecords(result, sortConfig);

        return result;
    }, [localTasks, activeTabId, query, priorityFilter, sortConfig]);

    // --- Stats ---
    const tabStats = useMemo(() => {
        const tabTasks = localTasks.filter(t => t.dynamicTableId === activeTabId);

        // Count done vs not done (assuming last column is "done")
        const doneColumnStatus = columns.length > 0 ? columns[columns.length - 1].status : 'done';
        const done = tabTasks.filter(t => t.status === doneColumnStatus).length;

        const byTable: Record<string, number> = {};
        localTasks.forEach(t => {
            byTable[t.dynamicTableId] = (byTable[t.dynamicTableId] || 0) + 1;
        });

        return {
            total: tabTasks.length,
            done,
            inProgress: tabTasks.length - done,
            byTable
        };
    }, [localTasks, activeTabId, columns]);

    // --- Handlers ---
    const handleTabChange = useCallback((tabId: string) => {
        if (onTabChangeCallback) onTabChangeCallback(tabId);
        setQuery('');
    }, [onTabChangeCallback]);

    const handleDragStart = useCallback((event: DragStartEvent) => {
        const { active } = event;
        const task = localTasks.find(t => t.id === active.id);
        setActiveTask(task || null);
    }, [localTasks]);

    const handleDragEnd = useCallback(async (event: DragEndEvent) => {
        const { active, over } = event;
        setActiveTask(null);

        if (!over) return;

        const activeId = String(active.id);
        const overId = String(over.id);

        if (columns.some(c => c.status === overId)) {
            // Dropped over a column
            const newStatus = overId as TaskStatus;
            const originalTasks = [...localTasks];

            // Optimistic update
            setLocalTasks(prev => prev.map(t => t.id === activeId ? { ...t, status: newStatus } : t));

            try {
                await DynamicTableService.updateRecord(activeTabId, activeId, { data: { status: newStatus } });
                refetch();
            } catch (error) {
                console.error(error);
                setLocalTasks(originalTasks); // Rollback
            }
        } else if (activeId !== overId) {
            // Reordering within column
            const oldIndex = localTasks.findIndex(t => t.id === activeId);
            const newIndex = localTasks.findIndex(t => t.id === overId);
            setLocalTasks(arrayMove(localTasks, oldIndex, newIndex));
        }
    }, [localTasks, columns, activeTabId, refetch]);

    return {
        // State
        query,
        setQuery,
        priorityFilter,
        setPriorityFilter,
        sortConfig,
        setSortConfig,

        // Computed
        filteredTasks,
        columns,
        activeTask,
        tabStats,

        // Handlers
        handleTabChange,
        handleDragStart,
        handleDragEnd
    };
}
