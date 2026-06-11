'use client';

/**
 * ProductRow - Linha de produto com sub-linhas de estoque por unidade
 * 
 * @description
 * Exibe os dados de um produto e itera sobre todas as unidades
 * para mostrar estoque específico de cada uma.
 * Suporta expand/collapse das linhas de unidade.
 */

import React, { useState, useMemo } from 'react';
import { useTranslation } from 'next-i18next';
import { MdInfo, MdKeyboardArrowRight } from 'react-icons/md';
import { isTableSchema } from '../../../components/shared/dynamic-tables.client';
import { UnitStockRow } from './UnitStockRow';
import { RelationCell } from '../../shared/components/RelationCell';
import { RowActionsCell } from '../../shared/components/RowActionsCell';
import { useRenderTypedValue } from '../../../shared/hooks/useRenderTypedValue';
import type {
    DynamicRecord,
    ProductData,
    UnitData,
    InventoryLookup
} from '../hooks/useProductsData';

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────

// --- Moved inside component to use t() ---

const SALE_USAGE_TYPES = ['Sale', 'For Sale'];

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface ProductRowProps {
    /** Registro do produto */
    product: DynamicRecord<ProductData>;
    /** Lista de unidades */
    units: DynamicRecord<UnitData>[];
    /** Lookup de inventário */
    inventoryLookup: InventoryLookup;
    /** ID da tabela de produtos */
    productTableId: string;
    /** Schema da tabela de produtos */
    productSchema: { schema?: unknown } | null;
    /** ID da tabela de inventário */
    inventoryTableId: string;
    /** Schema protegido de inventário */
    inventorySchema: { schema?: unknown } | null;
    /** Callbacks */
    onProductEdit: () => void;
    onInventoryEdit: () => void;
    /** Indica se a linha está sendo renderizada no modo widget (simplificado) */
    isWidgetMode?: boolean;
    /** Header visibility callback */
    isVisible: (colId: string) => boolean;
    /** Array of ordered column IDs that are visible */
    orderedCols: string[];
    /** Callback para botão de exclusão */
    onDeleteClick?: (product: DynamicRecord<ProductData>) => void;
    /** Module capabilities */
    hasInventory?: boolean;
    hasUnits?: boolean;
    /** Relation lookups: fieldName → Map<recordId, displayLabel> */
    productRelationLookups?: Record<string, Map<string, string>>;
}

// ─────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────

/**
 * Linha de produto com estoque por unidade
 */
export function ProductRow({
    product,
    units,
    inventoryLookup,
    productTableId,
    productSchema,
    inventoryTableId,
    inventorySchema,
    onProductEdit,
    onInventoryEdit,
    isWidgetMode = false,
    isVisible,
    orderedCols,
    onDeleteClick,
    hasInventory = true,
    hasUnits = true,
    productRelationLookups = {},
}: ProductRowProps) {
    const { t } = useTranslation(['common', 'database']);
    const renderTypedValue = useRenderTypedValue();
    const [isExpanded, setIsExpanded] = useState(false);


    const USAGE_TYPE_LABELS = useMemo<Record<string, string>>(() => ({
        'Sale': t('products_view.filters.sale', 'Venda'),
        'For Sale': t('products_view.filters.sale', 'Venda'),
        'Internal Use': t('products_view.filters.internal_use', 'Interno'),
        'Internal': t('products_view.filters.internal_use', 'Interno'),
    }), [t]);

    const d = product.data || {};
    const name = String(d.name || d.productName || '—');
    const sku = String(d.sku || '—');
    const brand = String(d.brand || '');
    const category = String(d.category || '');
    const type = String(d.usageType || '');
    const productInventory = inventoryLookup[product.id] || {};

    const { numberFormatMap, fieldTypeMap } = useMemo(() => {
        type NumberFormat = 'currency' | 'percentage' | 'integer' | 'decimal' | undefined;
        const numFmt = new Map<string, NumberFormat>();
        const fldType = new Map<string, string>();
        const schema = productSchema?.schema;
        if (isTableSchema(schema)) {
            for (const f of schema.fields) {
                numFmt.set(f.name, (f as { numberFormat?: NumberFormat }).numberFormat);
                fldType.set(f.name, f.type ?? 'text');
            }
        }
        return { numberFormatMap: numFmt, fieldTypeMap: fldType };
    }, [productSchema]);

    // Calculate total stock across all units for display
    const totalStock = units.reduce((sum, unit) => {
        const inv = productInventory[unit.id];
        return sum + (inv ? Number(inv.data?.stock || 0) : 0);
    }, 0);

    return (
        <React.Fragment>
            {/* Primary Product Row - Clickable to expand */}
            <tr
                onClick={() => { if (hasUnits && hasInventory) setIsExpanded(!isExpanded); }}
                className={`group bg-gray-50/50 dark:bg-neutral-800/20 border-t-2 border-gray-200 dark:border-gray-800 ${hasUnits && hasInventory ? 'cursor-pointer hover:bg-gray-100/50 dark:hover:bg-neutral-800/40' : ''} transition-colors`}
            >
                {/* Render Dynamic Sorted Cells */}
                {orderedCols.map((colId) => {
                    switch (colId) {
                        case 'product':
                            return (
                                <td key="col-product" className="px-2 py-3 truncate">
                                    <div className="flex items-center gap-3">
                                        {(hasUnits && hasInventory) ? (
                                            <MdKeyboardArrowRight
                                                size={20}
                                                className={`text-gray-400 shrink-0 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}
                                            />
                                        ) : (
                                            <div className="w-5 shrink-0" />
                                        )}
                                        <div className="flex flex-col min-w-0">
                                            <span className="text-sm font-black text-gray-900 dark:text-white uppercase tracking-tight truncate mt-0.5" title={name}>
                                                {name}
                                            </span>
                                            <div className="flex items-center gap-2 mt-1 truncate">
                                                {brand && <span className="text-[10px] font-bold text-gray-400 uppercase truncate" title={brand}>{brand}</span>}
                                                {brand && category && <span className="text-gray-300 text-[10px] shrink-0">|</span>}
                                                {category && <span className="text-[10px] font-bold text-blue-500/80 uppercase tracking-tighter truncate" title={category}>{category}</span>}
                                            </div>
                                        </div>
                                    </div>
                                </td>
                            );
                        case 'type':
                            return (
                                <td key="col-type" className="px-2 py-3 text-center truncate">
                                    <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-black uppercase truncate max-w-full ${SALE_USAGE_TYPES.includes(type)
                                        ? 'text-green-600 bg-green-50 dark:bg-green-950/30'
                                        : 'text-amber-600 bg-amber-50 dark:bg-amber-950/30'
                                        }`}>
                                        {USAGE_TYPE_LABELS[type] ?? t('products_view.filters.internal_use', 'Interno')}
                                    </span>
                                </td>
                            );
                        case 'unit':
                            return (
                                <td key="col-unit" className="px-2 py-3 truncate">
                                    {/* Empty as per user request to remove 'x units' info */}
                                </td>
                            );
                        case 'price':
                            return <td key="col-price" className="px-2 py-3 truncate"></td>;
                        case 'quantity':
                            return (
                                <td key="col-quantity" className="px-2 py-3 text-right truncate">
                                    <div className={`transition-opacity duration-200 ${isExpanded ? 'opacity-0' : 'opacity-100'} truncate inline-block w-full`}>
                                        <span className={`text-xs font-bold truncate ${totalStock > 0 ? 'text-emerald-600' : 'text-gray-400'}`}>
                                            {totalStock > 0 ? `${totalStock} ${t('unit_shorthand', 'UN')}` : '—'}
                                        </span>
                                    </div>
                                </td>
                            );
                        case 'actions':
                            return (
                                <RowActionsCell
                                    tableId={productTableId}
                                    tableSchema={productSchema?.schema}
                                    record={product}
                                    onEditSuccess={onProductEdit}
                                    tableName={t('database:tables.products', 'Produtos')}
                                    tableInternalName="products"
                                    onDeleteClick={onDeleteClick ? () => onDeleteClick(product) : undefined}
                                    isWidgetMode={isWidgetMode}
                                    stopPropagation
                                />
                            );
                        default: {
                            // Generic schema-driven path for all remaining fields
                            // Covers: sku, brand, category, and any future preset fields
                            const val = d[colId];
                            const lookup = productRelationLookups[colId];

                            let display: string | React.ReactNode;
                            if (val == null || val === '') {
                                display = '—';
                            } else if (lookup) {
                                display = <RelationCell value={val} lookup={lookup} />;
                            } else {
                                const fieldType = fieldTypeMap.get(colId) ?? 'text';
                                const fmt = numberFormatMap.get(colId);
                                display = renderTypedValue(val, fieldType, { numberFormat: fmt });
                            }

                            const isNumeric = fieldTypeMap.get(colId) === 'number';
                            return (
                                <td key={`col-${colId}`} className={`px-2 py-3 truncate text-xs ${isNumeric ? 'text-right' : ''} text-gray-600 dark:text-gray-400`}>
                                    <span className="truncate max-w-full inline-block" title={typeof display === 'string' && display !== '—' ? display : undefined}>
                                        {display}
                                    </span>
                                </td>
                            );
                        }
                    }
                })}
                {/* Filler cell to absorb remaining grid space */}
                <td className="px-2 py-3 truncate"></td>
            </tr>

            {/* Unit Stock Rows - Only render when expanded */}
            {(isExpanded && hasUnits && hasInventory) && units.map((unit) => (
                <UnitStockRow
                    key={`${product.id}-unit-${unit.id}`}
                    unit={unit}
                    stockData={productInventory[unit.id]}
                    inventoryTableId={inventoryTableId}
                    inventorySchema={inventorySchema?.schema as any}
                    onEditSuccess={onInventoryEdit}
                    isWidgetMode={isWidgetMode}
                    orderedCols={orderedCols}
                />
            ))}
        </React.Fragment>
    );
}