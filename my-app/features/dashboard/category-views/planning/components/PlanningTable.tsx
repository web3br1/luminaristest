'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'next-i18next';
import { MdArrowUpward, MdArrowDownward, MdUnfoldMore } from 'react-icons/md';
import { createPortal } from 'react-dom';
import { PlanningRow } from './PlanningRow';
import { useTableColumnControls } from '../../shared/hooks/useTableColumnControls';
import { useColumnSort } from '../../shared/hooks/useColumnSort';
import { CustomizeColumnsPanel } from '../../../shared/components/CustomizeColumnsPanel';
import type { SortOption } from '../../shared/SortSelect';
import type { IDynamicTable, IDynamicTableData } from '../../../components/shared/dynamic-tables.client';



interface PlanningTableProps {
    records: IDynamicTableData[];
    tableData: IDynamicTable | null;
    onSelectRecord: (record: IDynamicTableData) => void;
    onEditSuccess?: () => void;
    onDeleteClick?: (record: IDynamicTableData) => void;
    relationLookups?: Record<string, Map<string, string>>;
    isWidgetMode?: boolean;
    activeSortConfig?: SortOption | null;
    onSortChange?: (sort: SortOption | null) => void;
}

export function PlanningTable({
    records,
    tableData,
    onSelectRecord,
    onEditSuccess,
    onDeleteClick,
    relationLookups = {},
    isWidgetMode = false,
    activeSortConfig,
    onSortChange
}: PlanningTableProps) {
    const { t } = useTranslation(['common', 'database']);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);

    useEffect(() => {
        setPortalRoot(document.getElementById('planning-actions-portal'));
    }, []);

    const schema = tableData?.schema;
    
    // 1. Identify which fields are present in the schema
    const schemaFields = useMemo(() => {
        if (!schema || !Array.isArray(schema.fields)) return [];
        return schema.fields;
    }, [schema]);

    // 2. Build Columns dynamically from Schema
    const initialColumns = useMemo(() => {
        if (!schemaFields.length) return [];

        const fieldColumns = schemaFields
            .filter(f => !['id', 'tenantDbId', 'createdAt', 'updatedAt'].includes(f.name))
            .filter(f => !f.hidden)
            .map(f => {
                let width = 150;
                // Specific width logic based on name/type
                if (f.name === 'name' || f.name === 'title') width = 250;
                if (f.type === 'relation') width = 180;
                if (f.type === 'datetime' || f.type === 'date') width = 160;
                if (f.name === 'status' || f.name === 'appointmentStatus') width = 140;

                return {
                    id: f.name,
                    label: String(t(`database:fields.${f.name}`, f.label || f.name)),
                    defaultVisible: true,
                    defaultWidth: width,
                    minWidth: 50,
                    type: f.type,
                    relation: f.relation
                };
            });

        return [
            ...fieldColumns,
            {
                id: 'actions',
                label: t('actions', 'Actions'),
                defaultVisible: !isWidgetMode,
                defaultWidth: 80,
                minWidth: 50,
                type: 'actions',
            },
        ];
    }, [schemaFields, t, isWidgetMode]);

    const {
        columns,
        visibleCols,
        toggleColumn,
        moveColumn,
        resetColumns,
        colWidths,
        onMouseDown,
        activeResizingColId,
        tableWidth,
        isVisible
    } = useTableColumnControls(
        initialColumns,
        `lum-planning-table-${tableData?.id || 'default'}`
    );

    const visibleColumns = columns.filter(c => isVisible(c.id));


    const { isSortable, handleColSort, getColSortState } = useColumnSort(
        activeSortConfig ?? null,
        onSortChange ?? (() => {})
    );

    return (
        <div className="flex flex-col gap-2 h-full">
            {/* Customize Columns Panel — portaled into the header toolbar */}
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
                        {columns.map(col =>
                            isVisible(col.id)
                                ? <col key={`col-${col.id}`} style={{ width: colWidths[col.id], minWidth: colWidths[col.id], maxWidth: colWidths[col.id] }} />
                                : null
                        )}
                        <col style={{ width: 'auto' }} />
                    </colgroup>
                    
                    <thead className="bg-gray-100/50 dark:bg-neutral-800/50 sticky top-0 z-20 backdrop-blur-md">
                        <tr>
                            {columns.map((col) => {
                                if (!isVisible(col.id)) return null;
                                const width = colWidths[col.id];
                                const isCenter = col.id === 'status' || col.id === 'appointmentStatus' || col.id.toLowerCase().includes('status');
                                
                                const sortable = isSortable(col);
                                const sortState = getColSortState(col.id);
                                
                                return (
                                    <th
                                        key={col.id}
                                        onClick={sortable ? () => handleColSort(col.id) : undefined}
                                        className={`relative group px-4 py-3 border-b border-gray-200 dark:border-gray-800 transition-colors hover:bg-gray-200/50 dark:hover:bg-neutral-700/50 select-none ${sortable ? 'cursor-pointer' : ''} ${isCenter ? 'text-center' : 'text-left'}`}
                                    >
                                        <div className={`flex items-center gap-1 w-full ${isCenter ? 'justify-center' : 'justify-start'}`}>
                                            <span className="text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest truncate">
                                                {col.label}
                                            </span>
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

                                        {/* Seamless ERP Resize Handle */}
                                        <div
                                            onMouseDown={(e) => { e.stopPropagation(); onMouseDown(e, col.id); }}
                                            className={`absolute right-0 top-1.5 bottom-1.5 w-1 cursor-col-resize z-30 touch-none rounded-full transition-colors duration-200 ${activeResizingColId === col.id ? 'bg-blue-600 dark:bg-blue-500 scale-x-150' : 'bg-transparent group-hover:bg-gray-300 dark:group-hover:bg-neutral-700 hover:!bg-blue-500 dark:hover:!bg-blue-400'}`}
                                        />
                                    </th>
                                );
                            })}
                            <th className="px-2 py-3 border-b border-gray-200 dark:border-gray-800"></th>
                        </tr>
                    </thead>

                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800 bg-white dark:bg-neutral-950 w-full block sm:table-row-group">
                        {records.map((record) => (
                            <PlanningRow
                                key={record.id}
                                record={record}
                                columns={visibleColumns}
                                schema={schema ?? undefined}
                                tableId={tableData?.id}
                                onSelect={onSelectRecord}
                                onEditSuccess={onEditSuccess}
                                onDeleteClick={onDeleteClick}
                                colWidths={colWidths}
                                relationLookups={relationLookups}
                                isWidgetMode={isWidgetMode}
                            />
                        ))}
                        {records.length === 0 && (
                            <tr>
                                <td colSpan={visibleColumns.length + 1} className="py-20 text-center text-gray-400 text-sm">
                                    {t('common:no_records', 'No records found')}
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
