'use client';

/**
 * GenericTable — Tabela dinâmica com colunas customizáveis para GenericTabbedView
 *
 * @description
 * Implementa o padrão Gold Standard de tabelas dinâmicas:
 * - useTableColumnControls para resize, visibility e reordering persistidos
 * - CustomizeColumnsPanel portaled no header da view pai
 * - Sort por coluna com clique no header
 * - ConfirmDeleteModal para soft delete em 2 etapas
 * - Labels de colunas com tradução híbrida (i18n → field.label → camelCase)
 * - Todas as colunas do schema exibidas (sem limite hardcoded)
 *
 * Segue exatamente o mesmo padrão de ServicesTable / ProductsTable.
 */

import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'next-i18next';
import { MdArrowUpward, MdArrowDownward, MdUnfoldMore } from 'react-icons/md';

import { GenericRow } from './GenericRow';
import { useTableColumnControls } from '../hooks/useTableColumnControls';
import { CustomizeColumnsPanel } from '../../../shared/components/CustomizeColumnsPanel';
import { ConfirmDeleteModal } from '../../../shared/components/ConfirmDeleteModal';
import type { ITableSchema, ISchemaField } from '../../../components/shared/dynamic-tables.client';
import type { GenericRecord } from '../hooks/useGenericData';
import type { SortOption } from '../SortSelect';
import { useColumnSort } from '../hooks/useColumnSort';



// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

/** Stable empty Set so the `selectedIds` default never changes identity per render. */
const EMPTY_SELECTION: Set<string> = new Set();

/** Converts a camelCase field name to a readable label. */
function camelToLabel(field: string): string {
    return field
        .replace(/([A-Z])/g, ' $1')
        .replace(/^./, (s) => s.toUpperCase())
        .trim();
}

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface GenericTableProps {
    records: GenericRecord[];
    schema: ITableSchema;
    /** ID of the Dynamic Table — used as localStorage key for column config */
    tableId: string;
    /** Relation lookups built by useGenericData */
    relationLookups: Record<string, Map<string, string>>;
    /** Called after successful edit */
    onEditSuccess: () => void;
    /** HTTP soft delete — delegated from useGenericData */
    onDeleteConfirm: (record: GenericRecord) => Promise<void>;
    /** Sort config driven by parent */
    activeSortConfig?: SortOption | null;
    onSortChange?: (sort: SortOption | null) => void;
    isWidgetMode?: boolean;
    /**
     * Opt-in (CRM bulk actions). When true AND !isWidgetMode, a leading checkbox
     * column is rendered (select-all-on-page header + per-row checkbox). Rendered
     * as a FIXED leading th/td OUTSIDE useTableColumnControls so column
     * resize/visibility/order persistence is completely unaffected. Off → table
     * renders exactly as before.
     */
    enableSelection?: boolean;
    selectedIds?: Set<string>;
    onToggleSelect?: (id: string) => void;
    onToggleSelectAll?: (pageRecords: GenericRecord[]) => void;
}

// ─────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────

export function GenericTable({
    records,
    schema,
    tableId,
    relationLookups,
    onEditSuccess,
    onDeleteConfirm,
    activeSortConfig,
    onSortChange,
    isWidgetMode = false,
    enableSelection = false,
    selectedIds,
    onToggleSelect,
    onToggleSelectAll,
}: GenericTableProps) {
    const { t } = useTranslation(['common', 'database']);
    // Selection is fixed/leading and never shown in widget mode.
    const showSelection = enableSelection && !isWidgetMode;
    const selectionSet = selectedIds ?? EMPTY_SELECTION;
    const allPageSelected = records.length > 0 && records.every((r) => selectionSet.has(r.id));
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [recordToDelete, setRecordToDelete] = useState<GenericRecord | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState<string | null>(null);

    // ── Column Definitions ────────────────────────────────────
    const initialColumns = useMemo(() => {
        const cols: Array<{ id: string; label: string; type?: string; defaultVisible: boolean; defaultWidth: number; minWidth: number }> = schema.fields.map((field: ISchemaField) => ({
            id: field.name,
            // Hybrid label: i18n → field.label from schema → camelCase fallback
            label: String(t(`database:fields.${field.name}`, field.label || camelToLabel(field.name))),
            type: field.type,
            // Hide raw relation ID columns where we have a lookup
            defaultVisible:
                field.type !== 'relation' || !!relationLookups[field.name],
            defaultWidth: field.type === 'relation' ? 200 : field.type === 'string' ? 180 : 140,
            minWidth: 60,
        }));

        // Always add actions last
        cols.push({
            id: 'actions',
            label: String(t('actions', 'Actions')),
            type: 'actions',
            defaultVisible: !isWidgetMode,
            defaultWidth: 90,
            minWidth: 20,
        });
        return cols;
    }, [schema, t, isWidgetMode, relationLookups]);

    const {
        columns,
        visibleCols,
        toggleColumn,
        isVisible,
        colWidths,
        tableWidth,
        onMouseDown,
        activeResizingColId,
        moveColumn,
        resetColumns,
    } = useTableColumnControls(initialColumns, `lum-generic-${tableId}-config`);

    const { isSortable, handleColSort, getColSortState } = useColumnSort(
        activeSortConfig ?? null,
        onSortChange ?? (() => {})
    );

    // ── Delete Handlers ───────────────────────────────────────
    const handleDeleteConfirm = useCallback(async () => {
        if (!recordToDelete) return;
        setIsDeleting(true);
        setDeleteError(null);
        try {
            await onDeleteConfirm(recordToDelete);
            setRecordToDelete(null);
        } catch (err: unknown) {
            const msg = err instanceof Error
                ? err.message
                : t('error_deleting_record', 'An error occurred while inactivating the record.');
            setDeleteError(msg);
        } finally {
            setIsDeleting(false);
        }
    }, [recordToDelete, onDeleteConfirm, t]);

    // ── Portal ────────────────────────────────────────────────
    const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);
    useEffect(() => {
        setPortalRoot(document.getElementById('generic-table-actions-portal'));
    }, []);

    return (
        <div className="flex flex-col gap-2 h-full">
            {/* CustomizeColumnsPanel — portaled into the view's header */}
            {!isWidgetMode && portalRoot && createPortal(
                <CustomizeColumnsPanel
                    columns={columns}
                    visibleCols={visibleCols}
                    onToggle={toggleColumn}
                    onMoveColumn={moveColumn}
                    onReset={resetColumns}
                    isOpen={isMenuOpen}
                    onOpenChange={setIsMenuOpen}
                    isWidgetMode={isWidgetMode}
                />,
                portalRoot
            )}

            <div className="bg-white dark:bg-neutral-900 border border-gray-200 dark:border-gray-800 rounded-xl shadow-sm flex-1 overflow-auto custom-scrollbar relative">
                <table
                    className="divide-y divide-gray-200 dark:divide-gray-800 border-collapse table-fixed"
                    style={{ width: `max(100%, ${tableWidth}px)` }}
                >
                    <colgroup>
                        {showSelection && <col style={{ width: 44, minWidth: 44, maxWidth: 44 }} />}
                        {columns.map((col) => {
                            if (!isVisible(col.id)) return null;
                            const w = colWidths[col.id];
                            return (
                                <col
                                    key={`col-${col.id}`}
                                    style={{ width: w, minWidth: w, maxWidth: w }}
                                />
                            );
                        })}
                        <col style={{ width: 'auto' }} />
                    </colgroup>

                    {/* Header */}
                    <thead className="bg-gray-100/50 dark:bg-neutral-800/50 sticky top-0 z-10 shadow-sm">
                        <tr>
                            {showSelection && (
                                <th
                                    scope="col"
                                    className="px-2 py-3 text-center border-b border-gray-200 dark:border-gray-800 z-20"
                                >
                                    <input
                                        type="checkbox"
                                        checked={allPageSelected}
                                        onChange={() => onToggleSelectAll?.(records)}
                                        aria-label={t('database:bulk.select_all', 'Select all on page')}
                                        className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:border-neutral-600 dark:bg-neutral-700"
                                    />
                                </th>
                            )}
                            {columns.filter((c) => isVisible(c.id)).map((col) => {
                                const fieldType = col.type;
                                let alignClass = 'text-left';
                                let justifyClass = 'flex-start';
                                
                                if (col.id === 'actions' || fieldType === 'boolean' || fieldType === 'enum' || fieldType === 'relation') {
                                    alignClass = 'text-center';
                                    justifyClass = 'center';
                                } else if (fieldType === 'number') {
                                    alignClass = 'text-right';
                                    justifyClass = 'flex-end';
                                }

                                const sortable = isSortable(col);
                                const sortState = getColSortState(col.id);


                                return (
                                    <th
                                        key={col.id}
                                        scope="col"
                                        onClick={sortable ? () => handleColSort(col.id) : undefined}
                                        className={`px-2 py-3 text-[11px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-wider border-b border-gray-200 dark:border-gray-800 select-none group relative z-20 hover:bg-gray-200/80 dark:hover:bg-neutral-700/50 transition-colors ${sortable ? 'cursor-pointer' : ''} ${alignClass}`}
                                    >
                                        <div
                                            className="flex items-center gap-1 w-full"
                                            style={{ justifyContent: justifyClass }}
                                            title={col.label}
                                        >
                                            <span className="truncate">{col.label}</span>
                                            {sortable && (
                                                <span
                                                    className={`shrink-0 transition-opacity ${sortState ? 'opacity-100 text-blue-500' : 'opacity-0 group-hover:opacity-40'}`}
                                                >
                                                    {sortState?.direction === 'desc'
                                                        ? <MdArrowDownward size={13} />
                                                        : sortState
                                                        ? <MdArrowUpward size={13} />
                                                        : <MdUnfoldMore size={13} />}
                                                </span>
                                            )}
                                        </div>
                                        {/* Resize handle */}
                                        <div
                                            className={`absolute right-0 top-1.5 bottom-1.5 w-1 cursor-col-resize z-20 touch-none rounded-full transition-colors duration-200 ${activeResizingColId === col.id ? 'bg-blue-600 dark:bg-blue-500 scale-x-150' : 'bg-transparent group-hover:bg-gray-300 dark:group-hover:bg-neutral-700 hover:!bg-blue-500 dark:hover:!bg-blue-400'}`}
                                            onMouseDown={(e) => {
                                                e.stopPropagation();
                                                onMouseDown(e, col.id);
                                            }}
                                        />
                                    </th>
                                );
                            })}
                            {/* Filler header */}
                            <th className="px-2 py-3 border-b border-gray-200 dark:border-gray-800" />
                        </tr>
                    </thead>

                    {/* Body */}
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800 bg-white dark:bg-neutral-950 w-full block sm:table-row-group">
                        {records.map((record) => (
                            <GenericRow
                                key={record.id}
                                record={record}
                                schema={schema}
                                tableId={tableId}
                                relationLookups={relationLookups}
                                orderedCols={columns.filter((c) => isVisible(c.id)).map((c) => c.id)}
                                isWidgetMode={isWidgetMode}
                                onEditSuccess={onEditSuccess}
                                onDeleteClick={setRecordToDelete}
                                enableSelection={showSelection}
                                isSelected={selectionSet.has(record.id)}
                                onToggleSelect={onToggleSelect}
                            />
                        ))}
                    </tbody>
                </table>

                {records.length === 0 && (
                    <div className="flex items-center justify-center py-16 text-sm text-gray-400 dark:text-gray-600">
                        {t('no_records_in_table', 'No records in this table.')}
                    </div>
                )}
            </div>

            {/* Soft Delete Confirmation Modal */}
            <ConfirmDeleteModal
                isOpen={recordToDelete !== null}
                onClose={() => {
                    setRecordToDelete(null);
                    setDeleteError(null);
                }}
                onConfirm={handleDeleteConfirm}
                isDeleting={isDeleting}
                error={deleteError}
                title={t('confirm_delete_title', 'Inactivate Record?')}
                message={t(
                    'confirm_delete_generic_msg',
                    'This record will be inactivated. History will be preserved.'
                )}
            />
        </div>
    );
}

export default GenericTable;
