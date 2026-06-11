'use client';

/**
 * ServicesTable - Tabela de servicos com colunas dinamicas
 */

import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'next-i18next';
import { ServiceRow } from './ServiceRow';
import type { ColumnDefinition } from '../../shared/hooks/useTableColumnControls';
import { useTableColumnControls } from '../../shared/hooks/useTableColumnControls';
import { useColumnSort } from '../../shared/hooks/useColumnSort';
import { MdArrowUpward, MdArrowDownward, MdUnfoldMore } from 'react-icons/md';
import type { SortOption } from '../../shared/SortSelect';
import type { ServiceRecord } from '../hooks/useServicesData';
import { ConfirmDeleteModal } from '../../../shared/components/ConfirmDeleteModal';
import { CustomizeColumnsPanel } from '../../../shared/components/CustomizeColumnsPanel';
import type { ITableSchema } from '../../../components/shared/dynamic-tables.client';

const STRUCTURAL = new Set(['name', 'serviceName', 'isActive']);

// ─────────────────────────────────────────────────────────────
// Module-level constants (stable references, never recreated on render)
// ─────────────────────────────────────────────────────────────

const COL_TO_FIELD: Record<string, string> = {
    service:   'name',
    category:  'category',
    salePrice: 'salePrice',
    costPrice: 'costPrice',
    duration:  'duration',
    status:    'isActive',
};



interface ServicesTableProps {
    services: ServiceRecord[];
    tableId: string | null;
    schema: ITableSchema | null;
    activeSortConfig?: SortOption | null;
    onSortChange?: (sort: SortOption | null) => void;
    isWidgetMode?: boolean;
    onEditSuccess?: () => void;
    onDeleteConfirm?: (service: ServiceRecord) => Promise<void>;
    serviceRelationLookups?: Record<string, Map<string, string>>;
}

export function ServicesTable({
    services,
    tableId,
    schema,
    activeSortConfig,
    onSortChange,
    isWidgetMode = false,
    onEditSuccess,
    onDeleteConfirm,
    serviceRelationLookups = {},
}: ServicesTableProps) {
    const { t } = useTranslation(['common', 'database']);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [serviceToDelete, setServiceToDelete] = useState<ServiceRecord | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState<string | null>(null);

    const handleDeleteConfirm = useCallback(async () => {
        if (!serviceToDelete) return;
        setIsDeleting(true);
        setDeleteError(null);
        try {
            if (onDeleteConfirm) await onDeleteConfirm(serviceToDelete);
            else if (onEditSuccess) onEditSuccess();
            setServiceToDelete(null);
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : t('error_deleting_record', 'An error occurred while inactivating the record.');
            setDeleteError(msg);
        } finally {
            setIsDeleting(false);
        }
    }, [serviceToDelete, onDeleteConfirm, onEditSuccess, t]);

    const dataColumns = useMemo(() => {
        if (!schema) return [];
        return schema.fields.filter(f => !STRUCTURAL.has(f.name)).map(f => ({
            id: f.name,
            label: t(`database:fields.${f.name}`, f.label ?? f.name),
            type: f.type,
            defaultVisible: true,
            defaultWidth: f.type === 'number' ? 130 : f.type === 'boolean' ? 80 : 150,
            minWidth: 30,
        }));
    }, [schema, t]);

    // Pre-computed set of numeric column IDs — avoids per-column schema lookup in render
    const numericColIds = useMemo(() => {
        if (!schema) return new Set<string>();
        return new Set(schema.fields.filter(f => f.type === 'number').map(f => f.name));
    }, [schema]);

    const initialColumns = useMemo(() => [
        { id: 'service',  label: t('database:fields.service', 'Service'),   type: 'string',  defaultVisible: true, defaultWidth: 350, minWidth: 30 },
        ...dataColumns,
        { id: 'status',  label: t('database:fields.status', 'Status'),    type: 'boolean', defaultVisible: true, defaultWidth: 100, minWidth: 30 },
        { id: 'actions', label: t('actions', 'Actions'),                    type: 'actions', defaultVisible: !isWidgetMode, defaultWidth: 90, minWidth: 20 },
    ], [t, dataColumns, isWidgetMode]);

    const { columns, visibleCols, toggleColumn, isVisible, colWidths, tableWidth, onMouseDown, activeResizingColId, moveColumn, resetColumns } = useTableColumnControls(initialColumns, 'lum-services-grid-config');

    // COL_TO_FIELD mapeia IDs de coluna exibidas (ex. 'service') para nomes de campos do backend (ex. 'name').
    const { isSortable, handleColSort, getColSortState } = useColumnSort(
        activeSortConfig ?? null,
        onSortChange ?? (() => {}),
        { colToField: COL_TO_FIELD }
    );

    const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);
    useEffect(() => {
        setPortalRoot(document.getElementById('services-table-actions-portal'));
    }, []);

    return (
        <div className="flex flex-col gap-2 h-full">
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
                <table className="divide-y divide-gray-200 dark:divide-gray-800 border-collapse table-fixed" style={{ width: `max(100%, ${tableWidth}px)` }}>
                    <colgroup>
                        {columns.map(col => {
                            if (!isVisible(col.id)) return null;
                            const width = colWidths[col.id];
                            return <col key={`col-${col.id}`} style={{ width, minWidth: width, maxWidth: width }} />;
                        })}
                        <col style={{ width: 'auto' }} />
                    </colgroup>
                    <thead className="bg-gray-100/50 dark:bg-neutral-800/50 sticky top-0 z-10 w-full shadow-sm">
                        <tr>
                            {columns.filter(col => isVisible(col.id)).map((col) => {
                                const isRight = numericColIds.has(col.id);
                                const isCenter = col.id === 'status' || col.id === 'actions' || col.id === 'duration' || col.id === 'type';
                                const alignClass = isRight ? 'text-right' : isCenter ? 'text-center' : 'text-left';
                                const sortable = isSortable(col);
                                const sortState = getColSortState(col.id);

                                return (
                                    <th
                                        key={col.id}
                                        scope="col"
                                        title={col.label}
                                        onClick={sortable ? () => handleColSort(col.id) : undefined}
                                        className={`px-2 py-3 text-[11px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-wider border-b border-gray-200 dark:border-gray-800 select-none group relative z-20 hover:bg-gray-200/80 dark:hover:bg-neutral-700/50 transition-colors ${sortable ? 'cursor-pointer' : ''} ${alignClass}`}
                                    >
                                        <div className="flex items-center gap-1 w-full" style={{ justifyContent: isRight ? 'flex-end' : isCenter ? 'center' : 'flex-start' }}>
                                            <span className="truncate">{col.label}</span>
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
                                        <div
                                            className={`absolute right-0 top-1.5 bottom-1.5 w-1 cursor-col-resize z-20 touch-none rounded-full transition-colors duration-200 ${activeResizingColId === col.id ? 'bg-blue-600 dark:bg-blue-500 scale-x-150' : 'bg-transparent group-hover:bg-gray-300 dark:group-hover:bg-neutral-700 hover:!bg-blue-500 dark:hover:!bg-blue-400'}`}
                                            onMouseDown={(e) => { e.stopPropagation(); onMouseDown(e, col.id); }}
                                        />
                                    </th>
                                );
                            })}
                            <th className="px-2 py-3 border-b border-gray-200 dark:border-gray-800"></th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800 bg-white dark:bg-neutral-950 w-full block sm:table-row-group">
                        {services.map((service) => (
                            <ServiceRow
                                key={service.id}
                                service={service}
                                tableId={tableId}
                                schema={schema}
                                isWidgetMode={isWidgetMode}
                                orderedCols={columns.filter(c => isVisible(c.id)).map(c => c.id)}
                                onEditSuccess={onEditSuccess}
                                onDeleteClick={setServiceToDelete}
                                serviceRelationLookups={serviceRelationLookups}
                            />
                        ))}
                    </tbody>
                </table>
            </div>

            <ConfirmDeleteModal
                isOpen={serviceToDelete !== null}
                onClose={() => {
                    setServiceToDelete(null);
                    setDeleteError(null);
                }}
                onConfirm={handleDeleteConfirm}
                isDeleting={isDeleting}
                error={deleteError}
                title={t('confirm_delete_title', 'Inactivate Service?')}
                message={t('confirm_delete_service_msg', 'This service will be inactivated and will no longer appear for scheduling or new registrations. History will be fully preserved.')}
            />
        </div>
    );
}
