'use client';

/**
 * ProductsTable - Tabela de produtos com estoque por unidade
 * 
 * @description
 * Componente de tabela extraído para simplificar o InternalProductsView.
 * Renderiza a lista de produtos com suas respectivas linhas de estoque.
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'next-i18next';
import { ProductRow } from './ProductRow';
import { useTableColumnControls, ColumnDefinition } from '../../shared/hooks/useTableColumnControls';
import { useColumnSort } from '../../shared/hooks/useColumnSort';
import { MdArrowUpward, MdArrowDownward, MdUnfoldMore } from 'react-icons/md';
import type { SortOption } from '../../shared/SortSelect';
import { CustomizeColumnsPanel } from '../../../shared/components/CustomizeColumnsPanel';
import { isTableSchema, type ITableSchema } from '../../../components/shared/dynamic-tables.client';
import type {
    DynamicRecord,
    ProductData,
    UnitData,
    InventoryLookup
} from '../hooks/useProductsData';
import { ConfirmDeleteModal } from '../../../shared/components/ConfirmDeleteModal';

// ─────────────────────────────────────────────────────────────
// Module-level constants (stable references, never recreated on render)
// ─────────────────────────────────────────────────────────────

const STRUCTURAL = new Set(['name', 'productName', 'salePrice', 'stock', 'isActive']);

const COL_TO_FIELD: Record<string, string> = {
    product:  'name',
    sku:      'sku',
    category: 'category',
    brand:    'brand',
    type:     'usageType',
};



interface ProductsTableProps {
    products: DynamicRecord<ProductData>[];
    units: DynamicRecord<UnitData>[];
    inventoryLookup: InventoryLookup;
    productTableId: string;
    productSchema: { schema?: unknown } | null;
    inventoryTableId: string;
    inventorySchema: { schema?: unknown } | null;
    onProductEdit: () => void;
    onInventoryEdit: () => void;
    onDeleteConfirm?: (product: DynamicRecord<ProductData>) => Promise<void>;
    activeSortConfig?: SortOption | null;
    onSortChange?: (sort: SortOption | null) => void;
    isWidgetMode?: boolean;
    hasInventory?: boolean;
    hasUnits?: boolean;
    productRelationLookups?: Record<string, Map<string, string>>;
}

export function ProductsTable({
    products,
    units,
    inventoryLookup,
    productTableId,
    productSchema,
    inventoryTableId,
    inventorySchema,
    onProductEdit,
    onInventoryEdit,
    onDeleteConfirm,
    activeSortConfig,
    onSortChange,
    isWidgetMode = false,
    hasInventory = true,
    hasUnits = true,
    productRelationLookups = {},
}: ProductsTableProps) {
    const { t } = useTranslation(['common', 'database']);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [productToDelete, setProductToDelete] = useState<DynamicRecord<ProductData> | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState<string | null>(null);

    const handleDeleteConfirm = useCallback(async () => {
        if (!productToDelete) return;
        setIsDeleting(true);
        setDeleteError(null);
        try {
            if (onDeleteConfirm) await onDeleteConfirm(productToDelete);
            else onProductEdit();
            setProductToDelete(null);
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : t('error_deleting_record', 'An error occurred while inactivating the record.');
            setDeleteError(msg);
        } finally {
            setIsDeleting(false);
        }
    }, [productToDelete, onDeleteConfirm, onProductEdit, t]);

    const productDataColumns = useMemo(() => {
        if (!isTableSchema(productSchema?.schema)) return [];
        return productSchema!.schema!.fields.filter(f => !STRUCTURAL.has(f.name)).map(f => ({
            id: f.name === 'usageType' ? 'type' : f.name,
            label: String(t(`database:fields.${f.name}`, f.label || f.name)),
            type: f.type,
            defaultVisible: ['sku', 'usageType'].includes(f.name),
            defaultWidth: f.type === 'number' ? 120 : 150,
            minWidth: 30,
        }));
    }, [productSchema, t]);

    const initialColumns = useMemo(() => {
        const cols: ColumnDefinition[] = [
            { id: 'product', label: t('database:fields.product', 'Product / Identification'), type: 'string', defaultVisible: true, defaultWidth: 350, minWidth: 30 },
            ...productDataColumns,
        ];
        if (hasUnits && hasInventory) cols.push({ id: 'unit', label: t('database:fields.unitId', 'Business Unit'), type: 'relation', defaultVisible: true, defaultWidth: 150, minWidth: 30 });
        if (hasInventory) {
            cols.push({ id: 'price',    label: t('database:fields.salePrice', 'Unit Price'),  type: 'number', defaultVisible: true, defaultWidth: 130, minWidth: 30 });
            cols.push({ id: 'quantity', label: t('database:fields.quantity', 'Quantity'),     type: 'number', defaultVisible: true, defaultWidth: 120, minWidth: 30 });
        }
        cols.push({ id: 'actions', label: t('actions', 'Actions'), type: 'actions', defaultVisible: !isWidgetMode, defaultWidth: 90, minWidth: 20 });
        return cols;
    }, [t, productDataColumns, hasUnits, hasInventory, isWidgetMode]);

    const { columns, visibleCols, toggleColumn, isVisible, colWidths, tableWidth, onMouseDown, activeResizingColId, moveColumn, resetColumns } = useTableColumnControls(initialColumns, 'lum-products-grid-config');

    const numericColIds = useMemo(() => {
        const schema = productSchema?.schema;
        if (!schema || !isTableSchema(schema)) return new Set<string>();
        return new Set(schema.fields.filter(f => f.type === 'number').map(f => f.name));
    }, [productSchema]);

    const { isSortable, handleColSort, getColSortState } = useColumnSort(
        activeSortConfig ?? null,
        onSortChange ?? (() => {}),
        { colToField: COL_TO_FIELD }
    );

    const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);
    useEffect(() => {
        setPortalRoot(document.getElementById('products-table-actions-portal'));
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
                                const isRight = numericColIds.has(col.id) || col.id === 'price' || col.id === 'quantity';
                                const isCenter = col.id === 'type' || col.id === 'actions' || col.id === 'category' || col.id === 'brand' || col.id === 'sku';
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
                        {products.map(product => (
                            <ProductRow
                                key={product.id}
                                product={product}
                                units={units}
                                inventoryLookup={inventoryLookup}
                                productTableId={productTableId}
                                productSchema={productSchema}
                                inventoryTableId={inventoryTableId}
                                inventorySchema={inventorySchema?.schema as ITableSchema}
                                onProductEdit={onProductEdit}
                                onInventoryEdit={onInventoryEdit}
                                isWidgetMode={isWidgetMode}
                                isVisible={isVisible}
                                orderedCols={columns.filter(c => isVisible(c.id)).map(c => c.id)}
                                onDeleteClick={(product) => setProductToDelete(product)}
                                productRelationLookups={productRelationLookups}
                                hasInventory={hasInventory}
                                hasUnits={hasUnits}
                            />
                        ))}
                    </tbody>
                </table>
            </div>

            <ConfirmDeleteModal
                isOpen={productToDelete !== null}
                onClose={() => {
                    setProductToDelete(null);
                    setDeleteError(null);
                }}
                onConfirm={handleDeleteConfirm}
                isDeleting={isDeleting}
                error={deleteError}
                title={t('confirm_delete_title', 'Inactivate Product?')}
                message={t('confirm_delete_product_msg', 'This product will be inactivated and will no longer appear for sales or new registrations. History will be fully preserved.')}
            />
        </div>
    );
}
