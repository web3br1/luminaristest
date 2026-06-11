'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { 
    MdLocationOn, 
    MdAttachMoney, 
    MdInfo, 
    MdCheck, 
    MdSwapHoriz, 
    MdKeyboardArrowRight,
    MdArrowUpward,
    MdArrowDownward,
    MdUnfoldMore 
} from 'react-icons/md';
import { useTranslation } from 'next-i18next';
import { useTableColumnControls } from '../../shared/hooks/useTableColumnControls';
import { CustomizeColumnsPanel } from '../../../shared/components/CustomizeColumnsPanel';
import { createPortal } from 'react-dom';
import type { SortOption } from '../../shared/SortSelect';
import { useColumnSort } from '../../shared/hooks/useColumnSort';
import { useCurrency, SUPPORTED_CURRENCIES } from '@/lib/context/CurrencyContext';
import type { IDynamicTable, IDynamicTableData, ISchemaField } from '../../../components/shared/dynamic-tables.client';
import { useRenderTypedValue } from '../../../shared/hooks/useRenderTypedValue';
import { RelationCell } from '../../shared/components/RelationCell';

const STRUCTURAL = new Set(['productId', 'unitId', 'stock', 'reserved', 'salePrice']);

interface InventoryTableProps {
    filteredProducts: IDynamicTableData[];
    activeUnits: IDynamicTableData[];
    inventoryLookup: Record<string, Record<string, IDynamicTableData>>;
    unitFilter: string;

    // Inline Edit Props
    editingPriceId: string | null;
    editingPriceValue: string;
    isSavingPrice: boolean;
    setEditingPriceId: (id: string | null) => void;
    setEditingPriceValue: (val: string) => void;
    onSavePrice: (id: string, newPrice: number) => void;

    // Actions
    onOpenMovementModal: (product: IDynamicTableData, unit: IDynamicTableData, productName: string, unitName: string) => void;
    onSelectProduct?: (product: IDynamicTableData) => void;
    onSelectInventory?: (inventory: IDynamicTableData) => void;

    // Standard UI Props
    isWidgetMode?: boolean;
    activeSortConfig?: SortOption | null;
    onSortChange?: (sort: SortOption | null) => void;

    // Schema + Lookups
    inventoryTable: IDynamicTable | null;
    inventoryRelationLookups: Record<string, Map<string, string>>;
}

export function InventoryTable({
    filteredProducts,
    activeUnits,
    inventoryLookup,
    unitFilter,
    editingPriceId,
    editingPriceValue,
    isSavingPrice,
    setEditingPriceId,
    setEditingPriceValue,
    onSavePrice,
    onOpenMovementModal,
    onSelectProduct,
    onSelectInventory,
    isWidgetMode = false,
    activeSortConfig,
    onSortChange,
    inventoryTable,
    inventoryRelationLookups,
}: InventoryTableProps) {

    const { t } = useTranslation(['common', 'inventory_view']);
    const { currency } = useCurrency();
    const currencyInfo = SUPPORTED_CURRENCIES.find(c => c.code === currency) ?? SUPPORTED_CURRENCIES[0];
    const activeLocale = currencyInfo.locale;
    const activeCurrency = currencyInfo.symbol;

    // --- Schema-driven extra columns ---
    const inventorySchema = inventoryTable?.schema;
    const renderTypedValue = useRenderTypedValue();

    const extraColumns = useMemo(() =>
        (inventorySchema?.fields ?? [])
            .filter((f: ISchemaField) => !STRUCTURAL.has(f.name) && !f.hidden)
            .map((f: ISchemaField) => ({
                id: f.name,
                label: f.label || f.name,
                type: f.type,
                defaultVisible: true,
                defaultWidth: 140,
                minWidth: 60
            })),
        [inventorySchema]
    );

    // --- Helpers for Formatting ---
    const formatCurrencyInput = useCallback((value: string): string => {
        const numbers = value.replace(/\D/g, '');
        if (!numbers) return '';
        const cents = parseInt(numbers, 10);
        const amount = cents / 100;
        return new Intl.NumberFormat(activeLocale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(amount);
    }, [activeLocale]);

    const parseCurrencyToNumber = useCallback((value: string): number => {
        if (!value) return 0;
        const usesCommaDecimal = activeLocale === 'pt-BR' || activeLocale === 'de-DE';
        const cleaned = value
            .replace(activeCurrency, '')
            .replace(/\s/g, '')
            .replace(usesCommaDecimal ? /\./g : /,/g, '')
            .replace(usesCommaDecimal ? /,/g : /\./g, '.');
        return parseFloat(cleaned) || 0;
    }, [activeLocale, activeCurrency]);

    const [isCustomizeOpen, setIsCustomizeOpen] = useState(false);
    const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);
    useEffect(() => {
        setPortalRoot(document.getElementById('inventory-table-actions-portal'));
    }, []);


    // --- Table Configuration ---
    const initialColumns = useMemo(() => [
        { id: 'product',  label: t('inventory_view:table.product_description', 'Produto / Descrição'), type: 'string', defaultVisible: true, defaultWidth: 350, minWidth: 50 },
        { id: 'location', label: t('inventory_view:table.location', 'Localização (Unidade)'),           type: 'string', defaultVisible: true, defaultWidth: 200, minWidth: 30 },
        { id: 'price',    label: t('inventory_view:table.unit_value', 'Valor Unit.'),                   type: 'number', defaultVisible: true, defaultWidth: 140, minWidth: 30 },
        { id: 'balance',  label: t('inventory_view:table.physical_balance', 'Saldo Físico'),            type: 'number', defaultVisible: true, defaultWidth: 140, minWidth: 30 },
        { id: 'actions',  label: t('actions', 'Ações'),                                                 type: 'actions', defaultVisible: !isWidgetMode, defaultWidth: 100, minWidth: 40 },
        ...extraColumns,
    ], [t, isWidgetMode, extraColumns]);

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
        resetColumns
    } = useTableColumnControls(initialColumns, 'lum-inventory-grid-config');

    // Expand/Collapse state
    const [expandedProducts, setExpandedProducts] = useState<Set<string>>(new Set());

    const toggleProduct = useCallback((productId: string) => {
        setExpandedProducts(prev => {
            const next = new Set(prev);
            if (next.has(productId)) next.delete(productId);
            else next.add(productId);
            return next;
        });
    }, []);

    const { isSortable, handleColSort, getColSortState } = useColumnSort(
        activeSortConfig ?? null,
        onSortChange ?? (() => {})
    );


    return (
        <>
            {!isWidgetMode && portalRoot && createPortal(
                <CustomizeColumnsPanel
                    columns={columns}
                    visibleCols={visibleCols}
                    onToggle={toggleColumn}
                    onMoveColumn={moveColumn}
                    onReset={resetColumns}
                    isOpen={isCustomizeOpen}
                    onOpenChange={setIsCustomizeOpen}
                />,
                portalRoot
            )}
            <div className="bg-white dark:bg-neutral-900 border border-gray-200 dark:border-gray-800 rounded-xl shadow-sm flex-1 flex flex-col overflow-hidden relative">
                <div className="flex-1 overflow-auto custom-scrollbar">
                    <table className="divide-y divide-gray-200 dark:divide-gray-800 border-collapse table-fixed" style={{ width: `max(100%, ${tableWidth}px)` }}>
                        <colgroup>
                            {columns.map(col => {
                                if (!visibleCols.has(col.id)) return null;
                                const width = colWidths[col.id];
                                return <col key={`col-${col.id}`} style={{ width, minWidth: width, maxWidth: width }} />;
                            })}
                            {/* Filler column to absorb remaining empty screen space */}
                            <col style={{ width: 'auto' }} />
                        </colgroup>
                        <thead className="bg-gray-100/50 dark:bg-neutral-800/50 sticky top-0 z-10 w-full shadow-sm">
                        <tr>
                            {columns.filter(c => visibleCols.has(c.id)).map((col) => {
                                const sortable = isSortable(col);
                                const sortState = getColSortState(col.id);
                                return (
                                <th
                                    key={col.id}
                                    scope="col"
                                    style={{ width: colWidths[col.id] || col.defaultWidth }}
                                    className={`relative group px-2 py-3 text-left text-[11px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-wider border-b border-gray-200 dark:border-gray-800 select-none
                                        ${sortable ? 'cursor-pointer hover:bg-gray-200 dark:hover:bg-neutral-700/50' : ''}
                                    `}
                                    onClick={sortable ? () => handleColSort(col.id) : undefined}
                                >
                                    <div className="flex items-center">
                                        <span className="truncate">{col.label}</span>
                                        {sortable && (
                                            <span className={`ml-1 shrink-0 transition-opacity ${sortState ? 'opacity-100 text-blue-500' : 'opacity-0 group-hover:opacity-50'}`}>
                                                {sortState?.direction === 'desc'
                                                    ? <MdArrowDownward />
                                                    : sortState
                                                    ? <MdArrowUpward />
                                                    : <MdUnfoldMore />}
                                            </span>
                                        )}
                                    </div>

                                    {/* Seamless ERP Resize Handle */}
                                    <div
                                        className={`absolute right-0 top-1.5 bottom-1.5 w-1 cursor-col-resize z-20 touch-none rounded-full transition-colors duration-200 ${activeResizingColId === col.id ? 'bg-blue-600 dark:bg-blue-500 scale-x-150' : 'bg-transparent group-hover:bg-gray-300 dark:group-hover:bg-neutral-700 hover:!bg-blue-500 dark:hover:!bg-blue-400'}`}
                                        onMouseDown={(e) => { e.stopPropagation(); onMouseDown(e, col.id); }}
                                    />
                                </th>
                                );
                            })}
                            {/* Filler blank header to complete 100% width */}
                            <th className="px-2 py-3 border-b border-gray-200 dark:border-gray-800"></th>
                        </tr>
                    </thead>
                    <tbody className="bg-white dark:bg-neutral-900 divide-y divide-gray-100 dark:divide-gray-800">
                        {filteredProducts.map(prod => {
                            const d = prod.data || {};
                            const name = String(d.name || '—');
                            const sku = String(d.sku || '');
                            const category = String(d.category || '');
                            const pid = String(prod.id);
                            const productUnits = inventoryLookup[pid] || {};
                            const isExpanded = expandedProducts.has(pid);

                            const hasUnitMatch = activeUnits.some(u => productUnits[String(u.id)]);
                            if (unitFilter && !hasUnitMatch) return null;

                            const totals = activeUnits.reduce((acc, unit) => {
                                const inv = productUnits[String(unit.id)];
                                if (inv) {
                                    acc.stock += Number(inv.data?.stock || 0);
                                    acc.reserved += Number(inv.data?.reserved || 0);
                                }
                                return acc;
                            }, { stock: 0, reserved: 0 });
                            const totalAvailable = totals.stock - totals.reserved;

                            return (
                                <React.Fragment key={prod.id}>
                                    <tr
                                        onClick={() => toggleProduct(pid)}
                                        className="bg-gray-50/50 dark:bg-black/40 border-t-2 border-gray-200 dark:border-gray-800 cursor-pointer hover:bg-gray-100/50 dark:hover:bg-neutral-800/30 transition-colors"
                                    >
                                        {columns.filter(c => visibleCols.has(c.id)).map(col => {
                                            if (col.id === 'product') {
                                                return (
                                                    <td key={col.id} className="px-2 py-3">
                                                        <div className="flex items-center gap-3">
                                                            <MdKeyboardArrowRight
                                                                size={20}
                                                                className={`text-gray-400 transition-transform duration-200 ${isExpanded ? 'rotate-90' : ''}`}
                                                            />
                                                            <div className="flex flex-col cursor-pointer hover:underline decoration-blue-500/30 underline-offset-4" onClick={(e) => { e.stopPropagation(); onSelectProduct?.(prod); }}>
                                                                <div className="flex items-center gap-2">
                                                                    <span className="text-sm font-black text-gray-900 dark:text-white uppercase tracking-tight truncate max-w-[200px]">{name}</span>
                                                                    {sku && <span className="text-[10px] font-mono font-bold text-gray-400 bg-gray-100 dark:bg-neutral-800 px-1.5 py-0.5 rounded tracking-tighter">{sku}</span>}
                                                                </div>
                                                                {category && <span className="text-[9px] font-black text-blue-500 uppercase tracking-widest mt-0.5">{category}</span>}
                                                            </div>
                                                        </div>
                                                    </td>
                                                );
                                            }
                                            if (col.id === 'location') {
                                                return (
                                                    <td key={col.id} className="px-2 py-3">
                                                        {!isExpanded && (
                                                            <span className="text-[10px] font-bold text-gray-400">
                                                                {activeUnits.length} {t('common:unit_other', { count: activeUnits.length, defaultValue: 'unidades' })}
                                                            </span>
                                                        )}
                                                    </td>
                                                );
                                            }
                                            if (col.id === 'price') {
                                                return <td key={col.id} className="px-2 py-3"></td>;
                                            }
                                            if (col.id === 'balance') {
                                                return (
                                                    <td key={col.id} className="px-2 py-3 text-right">
                                                        {!isExpanded && (
                                                            <span className={`text-sm font-black tracking-tighter ${totalAvailable <= 5 ? 'text-red-500' : 'text-emerald-500'}`}>
                                                                {totalAvailable} <span className="text-[9px] text-gray-400 ml-0.5">{t('common:unit_shorthand', 'UN')}</span>
                                                            </span>
                                                        )}
                                                    </td>
                                                );
                                            }
                                            return <td key={col.id} className="px-2 py-3"></td>;
                                        })}
                                        {/* Filler cell to absorb remaining grid space */}
                                        <td className="px-2 py-3"></td>
                                    </tr>

                                    {isExpanded && activeUnits.map(unit => {
                                        const uid = String(unit.id);
                                        const inv = productUnits[uid];
                                        if (!inv && unitFilter) return null;

                                        const stock = inv ? Number(inv.data?.stock || 0) : 0;
                                        const reserved = inv ? Number(inv.data?.reserved || 0) : 0;
                                        const salePrice = inv ? Number(inv.data?.salePrice || 0) : 0;
                                        const available = stock - reserved;
                                        const isCritical = available <= 5;

                                        return (
                                            <tr key={`${prod.id}-${unit.id}`} className="group hover:bg-blue-50/30 dark:hover:bg-blue-500/5 transition-colors">
                                                {columns.filter(c => visibleCols.has(c.id)).map(col => {
                                                    if (col.id === 'product') return <td key={col.id} className="px-6 py-3"></td>;
                                                    if (col.id === 'location') {
                                                        return (
                                                            <td key={col.id} className="px-2 py-3">
                                                                <div className="flex items-center gap-2 pl-6 cursor-pointer hover:underline decoration-blue-500/30 underline-offset-4" onClick={() => onSelectInventory?.(inv)}>
                                                                    <MdLocationOn size={14} className="text-gray-300 dark:text-gray-600 group-hover:text-blue-500 transition-colors" />
                                                                    <span className="text-[11px] font-bold text-gray-600 dark:text-gray-400 uppercase tracking-tight">{String(unit.data.name || 'Unidade')}</span>
                                                                </div>
                                                            </td>
                                                        );
                                                    }
                                                    if (col.id === 'price') {
                                                        return (
                                                            <td key={col.id} className="px-2 py-3">
                                                                <div className="flex items-center justify-end gap-1.5">
                                                                    <div className="relative">
                                                                        <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] font-bold text-gray-400 pointer-events-none">{activeCurrency}</span>
                                                                        <input
                                                                            type="text"
                                                                            inputMode="decimal"
                                                                            value={editingPriceId === inv?.id ? editingPriceValue : (salePrice > 0 ? formatCurrencyInput((salePrice * 100).toFixed(0)) : '')}
                                                                            onChange={(e) => { if (inv) { setEditingPriceId(inv.id); setEditingPriceValue(formatCurrencyInput(e.target.value)); } }}
                                                                            onFocus={() => { if (inv) { setEditingPriceId(inv.id); setEditingPriceValue(salePrice > 0 ? formatCurrencyInput((salePrice * 100).toFixed(0)) : ''); } }}
                                                                            onBlur={() => setTimeout(() => { if (editingPriceId === inv?.id) { setEditingPriceId(null); setEditingPriceValue(''); } }, 150)}
                                                                            onKeyDown={(e) => { if (e.key === 'Enter' && inv) onSavePrice(inv.id, parseCurrencyToNumber(editingPriceValue)); }}
                                                                            className="w-20 pl-7 pr-2 py-1 text-right text-xs font-bold rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-neutral-800 text-emerald-600 dark:text-emerald-400 focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400 outline-none transition-all"
                                                                            placeholder="0,00"
                                                                            disabled={isSavingPrice}
                                                                        />
                                                                    </div>
                                                                    <div className="w-5 h-5 flex items-center justify-center">
                                                                        <button onClick={() => inv && onSavePrice(inv.id, parseCurrencyToNumber(editingPriceValue))} disabled={isSavingPrice || editingPriceId !== inv?.id} className={`p-0.5 rounded text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 transition-all ${editingPriceId === inv?.id ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
                                                                            {isSavingPrice ? <div className="w-4 h-4 border-2 border-emerald-400 border-t-transparent rounded-full animate-spin" /> : <MdCheck size={16} />}
                                                                        </button>
                                                                    </div>
                                                                </div>
                                                            </td>
                                                        );
                                                    }
                                                    if (col.id === 'balance') {
                                                        return (
                                                            <td key={col.id} className="px-2 py-3 text-right">
                                                                <div className="flex items-center justify-end gap-2">
                                                                    {available <= 0 ? (
                                                                        <span className="px-2 py-0.5 rounded-full bg-gray-200 dark:bg-neutral-800 text-[9px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest">{t('inventory_view:status.out_of_stock', 'Esgotado')}</span>
                                                                    ) : (
                                                                        <>
                                                                            {isCritical && <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />}
                                                                            <span className={`text-[13px] font-black tracking-tighter ${isCritical ? 'text-red-500' : 'text-emerald-500'}`}>
                                                                                {available} <span className="text-[9px] text-gray-400 ml-0.5">{t('common:unit_shorthand', 'UN')}</span>
                                                                            </span>
                                                                        </>
                                                                    )}
                                                                </div>
                                                            </td>
                                                        );
                                                    }
                                                    if (col.id === 'actions') {
                                                        return (
                                                            <td key={col.id} className="px-2 py-3 text-center">
                                                                <button onClick={() => onOpenMovementModal(prod, unit, name, String(unit.data.name || 'Unidade'))} className="p-1.5 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/40 transition-all group/btn" title={t('inventory_view:actions.register_movement', 'Registrar Movimentação')}>
                                                                    <MdSwapHoriz size={18} className="group-hover/btn:rotate-180 transition-transform duration-500" />
                                                                </button>
                                                            </td>
                                                        );
                                                    } else {
                                                        // Schema-driven dynamic column
                                                        const field = inventorySchema?.fields?.find((f: ISchemaField) => f.name === col.id);
                                                        const value = inv?.data?.[col.id];
                                                        if (field?.type === 'relation') {
                                                            return (
                                                                <td key={col.id} className="px-2 py-3">
                                                                    <RelationCell
                                                                        value={value}
                                                                        lookup={inventoryRelationLookups[col.id]}
                                                                    />
                                                                </td>
                                                            );
                                                        }
                                                        return (
                                                            <td key={col.id} className="px-2 py-3">
                                                                <span className="text-xs text-gray-600 dark:text-gray-400">
                                                                    {renderTypedValue(value, field?.type || 'text')}
                                                                </span>
                                                            </td>
                                                        );
                                                    }
                                                })}
                                                {/* Filler cell to absorb remaining grid space */}
                                                <td className="px-2 py-3"></td>
                                            </tr>
                                        );
                                    })}
                                </React.Fragment>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
        </>
    );
}

