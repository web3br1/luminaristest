'use client';

import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { MdDragIndicator } from 'react-icons/md';
import type { ColumnDefinition } from '../../category-views/shared/hooks/useTableColumnControls';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface SortableColumnItemProps {
    col: ColumnDefinition;
    isVisible: boolean;
    onToggle: (colId: string) => void;
    /** If true, hides the 'actions' column item (widget mode has no actions) */
    isWidgetMode?: boolean;
}

// ─────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────

/**
 * SortableColumnItem — Generic drag-and-drop row for the CustomizeColumnsPanel.
 * Can be used in any DataGrid view that uses `useTableColumnControls`.
 */
export function SortableColumnItem({ col, isVisible, onToggle, isWidgetMode = false }: SortableColumnItemProps) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
        isDragging,
    } = useSortable({ id: col.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        zIndex: isDragging ? 50 : 'auto',
        opacity: isDragging ? 0.8 : 1,
    };

    if (col.id === 'actions' && isWidgetMode) return null;

    return (
        <div
            ref={setNodeRef}
            style={style}
            className={`flex items-center gap-2 px-2 py-1.5 hover:bg-gray-100 dark:hover:bg-neutral-800 rounded-lg group transition-colors ${
                isDragging ? 'bg-white dark:bg-neutral-800 shadow-lg border border-blue-500/30' : ''
            }`}
        >
            {/* Drag Handle */}
            <div
                {...attributes}
                {...listeners}
                className="cursor-grab hover:text-blue-500 text-gray-300 dark:text-neutral-600 p-0.5 rounded touch-none shrink-0"
                title="Drag to reorder"
            >
                <MdDragIndicator size={16} />
            </div>

            {/* Toggle + Label */}
            <label className="flex items-center gap-3 cursor-pointer flex-1 min-w-0">
                <input
                    type="checkbox"
                    className="w-4 h-4 rounded border-gray-300 text-blue-600 shadow-sm focus:border-blue-300 focus:ring focus:ring-blue-200 focus:ring-opacity-50 dark:border-neutral-600 dark:bg-neutral-950 shrink-0"
                    checked={isVisible}
                    onChange={() => onToggle(col.id)}
                />
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors truncate">
                    {col.label}
                </span>
            </label>
        </div>
    );
}
