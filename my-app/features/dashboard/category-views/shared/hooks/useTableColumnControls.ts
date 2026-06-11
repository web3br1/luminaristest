'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';

/**
 * useTableColumnControls - Gold Standard hook for table column management.
 * Provides resizing, visibility toggling, and reordering with LocalStorage persistence.
 * Originally developed for ProductsView, now promoted to Shared Hook.
 */

export type ColumnDefinition = {
    id: string;
    label: string;
    defaultVisible: boolean;
    defaultWidth: number;
    minWidth?: number;
    maxWidth?: number;
    /** Field type — used by useColumnSort.isSortable. Mirrors ISchemaField.type. */
    type?: string;
};

export function useTableColumnControls(initialColumns: ColumnDefinition[], persistenceKey: string = '') {
    // Stable snapshot of defaults — never changes after mount
    const defaultsRef = useRef({
        colWidths: Object.fromEntries(initialColumns.map(c => [c.id, c.defaultWidth])) as Record<string, number>,
        visibleCols: new Set(initialColumns.filter(c => c.defaultVisible).map(c => c.id)),
        orderedColumns: initialColumns,
    });

    // 1. Column Visibility
    const [visibleCols, setVisibleCols] = useState<Set<string>>(() => {
        const visible = new Set<string>();
        initialColumns.forEach(col => {
            if (col.defaultVisible) visible.add(col.id);
        });
        return visible;
    });

    const toggleColumn = useCallback((colId: string) => {
        setVisibleCols(prev => {
            const next = new Set(prev);
            if (next.has(colId)) {
                next.delete(colId);
            } else {
                next.add(colId);
            }
            return next;
        });
    }, []);

    const isVisible = useCallback((colId: string) => visibleCols.has(colId), [visibleCols]);

    // 2. Column Order (Drag and Drop)
    const [orderedColumns, setOrderedColumns] = useState<ColumnDefinition[]>(initialColumns);

    const moveColumn = useCallback((oldIndex: number, newIndex: number) => {
        setOrderedColumns(prev => {
            const next = [...prev];
            const [moved] = next.splice(oldIndex, 1);
            next.splice(newIndex, 0, moved);
            return next;
        });
    }, []);

    // 4. Column Resizing (Drag & Drop for Resize)
    const [colWidths, setColWidths] = useState<Record<string, number>>(() => {
        const widths: Record<string, number> = {};
        initialColumns.forEach(col => {
            widths[col.id] = col.defaultWidth;
        });
        return widths;
    });

    const [activeResizingColId, setActiveResizingColId] = useState<string | null>(null);
    const startXRef = useRef<number>(0);
    const startWidthRef = useRef<number>(0);

    const onMouseDown = useCallback((e: React.MouseEvent, colId: string) => {
        e.preventDefault();
        setActiveResizingColId(colId);
        startXRef.current = e.clientX;
        startWidthRef.current = colWidths[colId] || 100;
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none'; // Prevent text selection
    }, [colWidths]);

    useEffect(() => {
        const onMouseMove = (e: MouseEvent) => {
            if (!activeResizingColId) return;
            const deltaX = e.clientX - startXRef.current;
            let newWidth = startWidthRef.current + deltaX;
            
            // Apply min/max constraints (low global floor if undefined)
            const colDef = initialColumns.find(c => c.id === activeResizingColId);
            const absoluteMin = 20; // ER-grade absolute floor
            const allowedMin = colDef?.minWidth ?? absoluteMin;
            if (newWidth < allowedMin) newWidth = allowedMin;
            
            if (colDef && colDef.maxWidth && newWidth > colDef.maxWidth) newWidth = colDef.maxWidth;

            setColWidths(prev => ({
                ...prev,
                [activeResizingColId]: newWidth
            }));
        };

        const onMouseUp = () => {
            if (activeResizingColId) {
                setActiveResizingColId(null);
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
            }
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);

        return () => {
            document.removeEventListener('mousemove', onMouseMove);
            document.removeEventListener('mouseup', onMouseUp);
        };
    }, [initialColumns, activeResizingColId]);

    // --- Initial Load from LocalStorage (Avoiding Server Hydration error) ---
    const [hasLoaded, setHasLoaded] = useState(false);

    useEffect(() => {
        if (!persistenceKey || typeof window === 'undefined' || hasLoaded) return;
        try {
            const raw = window.localStorage.getItem(persistenceKey);
            if (raw) {
                const saved = JSON.parse(raw);
                if (saved.colWidths) setColWidths(saved.colWidths);
                if (saved.visibleCols) setVisibleCols(new Set(saved.visibleCols));
                if (saved.orderedIds) {
                    // Reconstroi a ordem mesclando com possíveis novas colunas que surgiram no código original
                    const availableMap = new Map(initialColumns.map(c => [c.id, c]));
                    const newOrder: ColumnDefinition[] = [];
                    saved.orderedIds.forEach((id: string) => {
                        if (availableMap.has(id)) {
                            newOrder.push(availableMap.get(id)!);
                            availableMap.delete(id);
                        }
                    });
                    // Anexa colunas nativas inéditas ao final (evitando perder colunas novas do dev)
                    availableMap.forEach(col => newOrder.push(col));
                    setOrderedColumns(newOrder);
                }
            }
        } catch (e) {
            console.error('Failed to restore table column preferences:', e);
        } finally {
            setHasLoaded(true);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [persistenceKey]);

    // --- Continuous Save Listeners (Auto-Save) ---
    useEffect(() => {
        if (!persistenceKey || typeof window === 'undefined') return;
        // Avoid saving while user is actively dragging
        if (activeResizingColId) return;

        const timer = setTimeout(() => {
            const payload = {
                colWidths,
                visibleCols: Array.from(visibleCols),
                orderedIds: orderedColumns.map(c => c.id)
            };
            window.localStorage.setItem(persistenceKey, JSON.stringify(payload));
        }, 300); // 300ms throttle
        return () => clearTimeout(timer);
    }, [colWidths, visibleCols, orderedColumns, persistenceKey, activeResizingColId]);

    const tableWidth = useMemo(() => {
        return orderedColumns
            .filter(col => visibleCols.has(col.id))
            .reduce((total, col) => total + (colWidths[col.id] || col.defaultWidth), 0);
    }, [orderedColumns, visibleCols, colWidths]);

    // Reset to factory defaults — clears LocalStorage and all state
    const resetColumns = useCallback(() => {
        const d = defaultsRef.current;
        setColWidths({ ...d.colWidths });
        setVisibleCols(new Set(d.visibleCols));
        setOrderedColumns([...d.orderedColumns]);
        if (persistenceKey && typeof window !== 'undefined') {
            window.localStorage.removeItem(persistenceKey);
        }
    }, [persistenceKey]);

    return {
        columns: orderedColumns,
        visibleCols,
        toggleColumn,
        moveColumn,
        isVisible,
        colWidths,
        tableWidth,
        onMouseDown,
        activeResizingColId,
        resetColumns,
    };
}
