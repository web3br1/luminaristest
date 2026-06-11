'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'next-i18next';
import { MdArrowUpward, MdArrowDownward, MdUnfoldMore } from 'react-icons/md';
import { ExpensesRow } from './ExpensesRow';
import { ExpenseRecord } from '../../types/expenses.types';
import type { IDynamicTable, ISchemaField } from '@/features/dashboard/components/shared/dynamic-tables.client';
import type { ColumnDefinition } from '@/features/dashboard/category-views/shared/hooks/useTableColumnControls';
import { useTableColumnControls } from '@/features/dashboard/category-views/shared/hooks/useTableColumnControls';
import { useColumnSort } from '@/features/dashboard/category-views/shared/hooks/useColumnSort';
import { CustomizeColumnsPanel } from '@/features/dashboard/shared/components/CustomizeColumnsPanel';
import { ConfirmDeleteModal } from '@/features/dashboard/shared/components/ConfirmDeleteModal';
import type { SortOption } from '@/features/dashboard/category-views/shared/SortSelect';

/** @deprecated — ColumnDefinition now includes type?: string. Kept as alias for backward compat. */
export type ExpensesColumn = ColumnDefinition & { relation?: unknown };


interface ExpensesTableProps {
    records: ExpenseRecord[];
    tableData: IDynamicTable | null | undefined;
    onSelectRecord: (record: ExpenseRecord) => void;
    onEditSuccess?: () => void;
    onDeleteConfirm?: (record: ExpenseRecord) => Promise<void>;
    relationLookups?: Record<string, Map<string, string>>;
    isWidgetMode?: boolean;
    activeSortConfig?: SortOption | null;
    onSortChange?: (sort: SortOption | null) => void;
}

export function ExpensesTable({
    records,
    tableData,
    onSelectRecord,
    onEditSuccess,
    onDeleteConfirm,
    relationLookups = {},
    isWidgetMode = false,
    activeSortConfig,
    onSortChange,
}: ExpensesTableProps) {
    const { t } = useTranslation(['common', 'database']);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);

    // Delete modal state
    const [recordToDelete, setRecordToDelete] = useState<ExpenseRecord | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState<string | null>(null);

    useEffect(() => {
        setPortalRoot(document.getElementById('finance-actions-portal'));
    }, []);

    const schema = tableData?.schema;

    // ITableSchema.fields is required — no cast needed after Stage 1 type consolidation
    const schemaFields = useMemo(() => {
        if (!schema?.fields) return [] as ISchemaField[];
        return schema.fields;
    }, [schema]);

    const initialColumns = useMemo(() => {
        if (!schemaFields.length) return [];
        const fieldCols = schemaFields
            .filter(f => !['id', 'tenantDbId', 'createdAt', 'updatedAt'].includes(f.name))
            .map(f => {
                let width = 150;
                if (f.name === 'description' || f.name === 'name') width = 300;
                if (f.type === 'relation') width = 180;
                if (f.type === 'date' || f.type === 'datetime') width = 140;
                if (f.name === 'amount' || f.name === 'valor') width = 140;
                return {
                    id: f.name,
                    label: String(t(`database:fields.${f.name}`, f.label || f.name)),
                    defaultVisible: true,
                    defaultWidth: width,
                    minWidth: 80,
                    type: f.type,
                    relation: f.relation,
                };
            });
        return [
            ...fieldCols,
            {
                id: 'actions',
                label: t('common:actions', 'Actions'),
                defaultVisible: !isWidgetMode,
                defaultWidth: 80,
                minWidth: 50,
                type: 'actions',
            },
        ];
    }, [schemaFields, t, isWidgetMode]);

    const {
        columns,
        colWidths,
        onMouseDown,
        activeResizingColId,
        tableWidth,
        isVisible,
        toggleColumn,
        moveColumn,
        resetColumns,
        visibleCols,
    } = useTableColumnControls(
        initialColumns,
        `lum-finance-expenses-table-${tableData?.id || 'default'}`
    );

    const visibleColumns = columns.filter(c => isVisible(c.id));

    const { isSortable, handleColSort, getColSortState } = useColumnSort(
        activeSortConfig ?? null,
        onSortChange ?? (() => {})
    );

    // ── Delete ──────────────────────────────────────────────────

    const handleDeleteConfirm = async () => {
        if (!recordToDelete || !onDeleteConfirm) return;
        setIsDeleting(true);
        setDeleteError(null);
        try {
            await onDeleteConfirm(recordToDelete);
            setRecordToDelete(null);
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : t('common:error_deleting_record', 'An error occurred while inactivating the record.');
            setDeleteError(msg);
        } finally {
            setIsDeleting(false);
        }
    };

    return (
        <div className="flex flex-col gap-2 h-full">
            {/* Customize Columns Panel — portaled into the toolbar */}
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

            <div className="bg-white dark:bg-neutral-900 border border-gray-200 dark:border-gray-800 rounded-xl shadow-sm flex-1 overflow-auto custom-scrollbar relative flex flex-col">
                <table className="divide-y divide-gray-200 dark:divide-gray-800 border-collapse table-fixed" style={{ width: `max(100%, ${tableWidth}px)` }}>
                    <colgroup>
                        {columns.map(col => isVisible(col.id) && <col key={`col-${col.id}`} style={{ width: colWidths[col.id], minWidth: colWidths[col.id], maxWidth: colWidths[col.id] }} />)}
                        <col style={{ width: 'auto' }} />
                    </colgroup>
                    <thead className="bg-gray-100/50 dark:bg-neutral-800/50 sticky top-0 z-20 backdrop-blur-md">
                        <tr>
                            {columns.map((col) => {
                                if (!isVisible(col.id)) return null;
                                const width = colWidths[col.id];
                                const isCenter = col.id === 'isPlanned' || col.id === 'paymentStatus' || col.id === 'category';
                                const isRight = col.id === 'amount' || col.id === 'valor' || col.id.toLowerCase().includes('total');
                                const sortable = isSortable(col);
                                const sortState = getColSortState(col.id);
                                return (
                                    <th
                                        key={col.id}
                                        onClick={sortable ? () => handleColSort(col.id) : undefined}
                                        className={`relative group px-4 py-3 border-b border-gray-200 dark:border-gray-800 transition-colors hover:bg-gray-200/50 dark:hover:bg-neutral-700/50 select-none ${sortable ? 'cursor-pointer' : ''} ${isCenter ? 'text-center' : isRight ? 'text-right' : 'text-left'}`}
                                        style={{ width, minWidth: width, maxWidth: width }}
                                    >
                                        <div className={`flex items-center gap-1 ${isCenter ? 'justify-center' : isRight ? 'justify-end' : 'justify-start'}`}>
                                            <span className="text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest truncate">{col.label}</span>
                                            {sortable && (
                                                <span className={`shrink-0 transition-opacity ${sortState ? 'opacity-100 text-blue-500' : 'opacity-0 group-hover:opacity-40'}`}>
                                                    {sortState?.direction === 'desc'
                                                        ? <MdArrowDownward size={13} />
                                                        : sortState
                                                        ? <MdArrowUpward size={13} />
                                                        : <MdUnfoldMore size={13} />}
                                                </span>
                                            )}
                                        </div>
                                        <div onMouseDown={(e) => { e.stopPropagation(); onMouseDown(e, col.id); }} className={`absolute right-0 top-1.5 bottom-1.5 w-1 cursor-col-resize z-30 touch-none rounded-full transition-colors duration-200 ${activeResizingColId === col.id ? 'bg-blue-600 dark:bg-blue-500 scale-x-150' : 'bg-transparent group-hover:bg-gray-300 dark:group-hover:bg-neutral-700 hover:!bg-blue-500 dark:hover:!bg-blue-400'}`} />
                                    </th>
                                );
                            })}
                            <th className="px-2 py-3 border-b border-gray-200 dark:border-gray-800" />
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800 bg-white dark:bg-neutral-950 w-full block sm:table-row-group">
                        {records.map((record) => (
                            <ExpensesRow
                                key={record.id}
                                record={record}
                                columns={visibleColumns}
                                schema={schemaFields}
                                tableId={tableData?.id ?? ''}
                                tableSchema={tableData?.schema}
                                onSelect={onSelectRecord}
                                onEditSuccess={onEditSuccess}
                                onDeleteClick={onDeleteConfirm ? setRecordToDelete : undefined}
                                colWidths={colWidths}
                                relationLookups={relationLookups}
                                isWidgetMode={isWidgetMode}
                            />
                        ))}
                        {records.length === 0 && (
                            <tr><td colSpan={visibleColumns.length + 1} className="py-20 text-center text-gray-400 text-sm">{t('common:no_records', 'No records found')}</td></tr>
                        )}
                    </tbody>
                </table>
            </div>

            <ConfirmDeleteModal
                isOpen={recordToDelete !== null}
                onClose={() => { setRecordToDelete(null); setDeleteError(null); }}
                onConfirm={handleDeleteConfirm}
                isDeleting={isDeleting}
                error={deleteError}
                title={t('common:confirm_delete_title', 'Inactivate Expense?')}
                message={t('common:confirm_delete_generic_msg', 'This record will be inactivated. History will be preserved.')}
            />
        </div>
    );
}
