'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'next-i18next';
import { MdViewColumn, MdRestartAlt } from 'react-icons/md';
import {
    DndContext,
    closestCenter,
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    type DragEndEvent,
} from '@dnd-kit/core';
import {
    SortableContext,
    sortableKeyboardCoordinates,
    verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import type { ColumnDefinition } from '../../category-views/shared/hooks/useTableColumnControls';
import { SortableColumnItem } from './SortableColumnItem';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface CustomizeColumnsPanelProps {
    /** Ordered list of all columns (visible or not) */
    columns: ColumnDefinition[];
    /** Set of currently visible column IDs */
    visibleCols: Set<string>;
    /** Toggle visibility of a column */
    onToggle: (colId: string) => void;
    /** Reorder columns by index */
    onMoveColumn: (fromIndex: number, toIndex: number) => void;
    /** Reset all columns to factory defaults */
    onReset: () => void;
    /** Whether the panel is open */
    isOpen: boolean;
    /** Toggle open/close */
    onOpenChange: (open: boolean) => void;
    /** If true, hides the 'actions' column row */
    isWidgetMode?: boolean;
}

// ─────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────

/**
 * CustomizeColumnsPanel — Generic, reusable column customization UI.
 *
 * Features:
 * - Toggle column visibility
 * - Drag-and-drop column reordering
 * - Reset to defaults button
 * - Close on Escape key or click outside
 * - Dropdown rendered via body portal (escapes all stacking contexts)
 */
export function CustomizeColumnsPanel({
    columns,
    visibleCols,
    onToggle,
    onMoveColumn,
    onReset,
    isOpen,
    onOpenChange,
    isWidgetMode = false,
}: CustomizeColumnsPanelProps) {
    const { t } = useTranslation(['common']);
    const triggerRef = useRef<HTMLButtonElement>(null);
    const panelRef = useRef<HTMLDivElement>(null);
    const [dropdownStyle, setDropdownStyle] = useState<React.CSSProperties>({});
    const [mounted, setMounted] = useState(false);

    useEffect(() => { setMounted(true); }, []);

    // Recompute dropdown position whenever it opens
    useEffect(() => {
        if (isOpen && triggerRef.current) {
            const rect = triggerRef.current.getBoundingClientRect();
            setDropdownStyle({
                top: rect.bottom + 8,
                right: window.innerWidth - rect.right,
            });
        }
    }, [isOpen]);

    // --- DnD Setup ---
    const sensors = useSensors(
        useSensor(PointerSensor, {
            activationConstraint: { delay: 100, tolerance: 5 },
        }),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    const handleDragEnd = useCallback((event: DragEndEvent) => {
        const { active, over } = event;
        if (over && active.id !== over.id) {
            const oldIndex = columns.findIndex(c => c.id === active.id);
            const newIndex = columns.findIndex(c => c.id === over.id);
            if (oldIndex !== -1 && newIndex !== -1) {
                onMoveColumn(oldIndex, newIndex);
            }
        }
    }, [columns, onMoveColumn]);

    // --- Close on Escape or click outside ---
    useEffect(() => {
        if (!isOpen) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onOpenChange(false);
        };

        const handleClickOutside = (e: MouseEvent) => {
            const target = e.target as Node;
            const clickedInsidePanel = panelRef.current?.contains(target);
            const clickedTrigger = triggerRef.current?.contains(target);
            if (!clickedInsidePanel && !clickedTrigger) {
                onOpenChange(false);
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        const timer = setTimeout(() => {
            document.addEventListener('mousedown', handleClickOutside);
        }, 50);

        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            clearTimeout(timer);
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isOpen, onOpenChange]);

    const handleReset = useCallback(() => {
        onReset();
        onOpenChange(false);
    }, [onReset, onOpenChange]);

    const handleToggleOpen = useCallback(() => {
        onOpenChange(!isOpen);
    }, [onOpenChange, isOpen]);

    // --- Stats ---
    const visibleCount = columns.filter(c => visibleCols.has(c.id)).length;
    const totalCount = isWidgetMode ? columns.filter(c => c.id !== 'actions').length : columns.length;

    const dropdown = isOpen && mounted ? createPortal(
        <div
            ref={panelRef}
            style={{ ...dropdownStyle, position: 'fixed', zIndex: 9999 }}
            className="w-60 bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-700 rounded-xl shadow-2xl ring-1 ring-black/5 dark:ring-white/5 overflow-hidden"
        >
            {/* Panel Header */}
            <div className="px-3 py-2.5 border-b border-gray-100 dark:border-neutral-800 bg-gray-50 dark:bg-neutral-800/60">
                <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase text-gray-400 dark:text-neutral-500 tracking-widest">
                        {t('visible_columns', 'Visible Columns')}
                    </span>
                    <span className="text-[10px] font-bold text-gray-400 dark:text-neutral-500 bg-gray-100 dark:bg-neutral-800 px-1.5 py-0.5 rounded-md">
                        {visibleCount}/{totalCount}
                    </span>
                </div>
                <p className="text-[9px] text-gray-400 dark:text-neutral-500 mt-0.5">
                    {t('drag_to_reorder', 'Drag to reorder')}
                </p>
            </div>

            {/* Column List */}
            <div className="p-2 max-h-72 overflow-y-auto custom-scrollbar">
                <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleDragEnd}
                >
                    <SortableContext items={columns.map(c => c.id)} strategy={verticalListSortingStrategy}>
                        <div className="flex flex-col gap-0.5">
                            {columns.map(col => (
                                <SortableColumnItem
                                    key={col.id}
                                    col={col}
                                    isVisible={visibleCols.has(col.id)}
                                    onToggle={onToggle}
                                    isWidgetMode={isWidgetMode}
                                />
                            ))}
                        </div>
                    </SortableContext>
                </DndContext>
            </div>

            {/* Panel Footer — Reset Button */}
            <div className="px-3 py-2 border-t border-gray-100 dark:border-neutral-800 bg-gray-50/50 dark:bg-neutral-800/30">
                <button
                    onClick={handleReset}
                    className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-[11px] font-bold text-gray-500 dark:text-neutral-400 hover:text-red-500 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/20 rounded-lg transition-colors"
                >
                    <MdRestartAlt size={14} />
                    {t('reset_to_default', 'Reset to Default')}
                </button>
            </div>
        </div>,
        document.body
    ) : null;

    return (
        <div className="relative flex items-center justify-center">
            {/* Trigger Button */}
            <button
                ref={triggerRef}
                onClick={handleToggleOpen}
                className={`flex items-center gap-2 px-3 py-1.5 text-xs font-semibold border rounded-lg transition-colors shadow-sm
                    ${isOpen
                        ? 'bg-blue-50 dark:bg-blue-950/40 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300'
                        : 'text-gray-700 dark:text-gray-200 bg-white dark:bg-neutral-800 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-neutral-700'
                    }`}
            >
                <MdViewColumn size={16} className={isOpen ? 'text-blue-500' : 'text-gray-500 dark:text-gray-400'} />
                {t('customize_columns', 'Customize Columns')}
            </button>

            {dropdown}
        </div>
    );
}
