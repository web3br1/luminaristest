'use client';

/**
 * UnitStockRow - Linha de estoque por unidade de negocio
 */

import React, { useMemo } from 'react';
import { MdLocationOn } from 'react-icons/md';
import { useTranslation } from 'next-i18next';
import { RowActionsCell } from '../../shared/components/RowActionsCell';
import { useRenderTypedValue } from '../../../shared/hooks/useRenderTypedValue';
import type { DynamicRecord, InventoryData, UnitData } from '../hooks/useProductsData';

interface UnitStockRowProps {
    unit: DynamicRecord<UnitData>;
    stockData?: DynamicRecord<InventoryData>;
    inventoryTableId: string;
    inventorySchema: { fields: unknown[] } | null;
    onEditSuccess: () => void;
    isWidgetMode?: boolean;
    orderedCols: string[];
}

export function UnitStockRow({
    unit,
    stockData,
    inventoryTableId,
    inventorySchema,
    onEditSuccess,
    isWidgetMode = false,
    orderedCols,
}: UnitStockRowProps) {
    const { t } = useTranslation(['common', 'database']);
    const renderTypedValue = useRenderTypedValue();
    const unitName = String(unit.data?.name || t('unit_default', 'Unidade'));
    const stockQty = stockData ? Number(stockData.data?.stock || 0) : 0;
    const stockValue = stockData ? Number(stockData.data?.salePrice || 0) : 0;

    const numberFormatMap = useMemo(() => {
        type NumberFormat = 'currency' | 'percentage' | 'integer' | 'decimal' | undefined;
        const map = new Map<string, NumberFormat>();
        if (inventorySchema?.fields) {
            for (const f of inventorySchema.fields as { name: string; numberFormat?: NumberFormat }[]) {
                map.set(f.name, f.numberFormat);
            }
        }
        return map;
    }, [inventorySchema]);

    return (
        <tr className="group hover:bg-blue-50/30 dark:hover:bg-blue-500/5 transition-colors">
            {orderedCols.map((colId) => {
                switch (colId) {
                    case 'product':
                        return <td key={`u-col-${colId}`} className="px-6 py-3 border-r border-gray-50 dark:border-gray-800/50"></td>;
                    case 'category':
                        return <td key={`u-col-${colId}`} className="px-6 py-3 border-r border-gray-50 dark:border-gray-800/50"></td>;
                    case 'brand':
                        return <td key={`u-col-${colId}`} className="px-6 py-3 border-r border-gray-50 dark:border-gray-800/50"></td>;
                    case 'sku':
                        return <td key={`u-col-${colId}`} className="px-6 py-3 border-r border-gray-50 dark:border-gray-800/50"></td>;
                    case 'type':
                        return <td key={`u-col-${colId}`} className="px-6 py-3 border-r border-gray-50 dark:border-gray-800/50"></td>;
                    case 'unit':
                        return (
                            <td key={`u-col-${colId}`} title={unitName} className="px-2 py-3 truncate border-r border-gray-50 dark:border-gray-800/50">
                                <div className="flex items-center gap-2">
                                    <MdLocationOn size={14} className="text-blue-500 shrink-0 group-hover:scale-110 transition-transform" />
                                    <span className="text-[11px] font-bold text-gray-600 dark:text-gray-400 uppercase tracking-tight truncate">
                                        {unitName}
                                    </span>
                                </div>
                            </td>
                        );
                    case 'price': {
                        const fmt = numberFormatMap.get('salePrice');
                        return (
                            <td key={`u-col-${colId}`} className="px-2 py-3 text-right truncate border-r border-gray-50 dark:border-gray-800/50">
                                <span className="text-xs font-bold text-gray-800 dark:text-gray-200 truncate inline-block w-full">
                                    {typeof stockValue === 'number'
                                        ? renderTypedValue(stockValue, 'number', { numberFormat: fmt })
                                        : '—'}
                                </span>
                            </td>
                        );
                    }
                    case 'quantity':
                        return (
                            <td key={`u-col-${colId}`} className="px-2 py-3 text-right truncate border-r border-gray-50 dark:border-gray-800/50">
                                <div className="flex items-center justify-end gap-2 truncate w-full">
                                    {stockQty <= 5 && stockQty > 0 && (
                                        <span className="text-[9px] font-black bg-red-100 text-red-600 px-1.5 py-0.5 rounded animate-pulse shrink-0">
                                            {t('low_stock', 'BAIXO')}
                                        </span>
                                    )}
                                    <span className={`text-[13px] font-black tracking-tighter shrink-0 ${stockQty <= 0 ? 'text-gray-300' : stockQty <= 5 ? 'text-red-500' : 'text-emerald-500'}`}>
                                        {stockQty} <span className="text-[9px] text-gray-400 ml-0.5">{t('unit_shorthand', 'UN')}</span>
                                    </span>
                                </div>
                            </td>
                        );
                    case 'actions':
                        return (
                            <RowActionsCell
                                tableId={inventoryTableId}
                                tableSchema={inventorySchema as unknown}
                                record={stockData ?? { id: '', data: {} }}
                                onEditSuccess={onEditSuccess}
                                tableName={t('database:tables.inventory', 'Estoque')}
                                tableInternalName="inventory"
                                isWidgetMode={isWidgetMode || !stockData || !inventorySchema}
                                tdClassName="px-6 border-l border-gray-50/50 dark:border-gray-800/50"
                            />
                        );
                    default:
                        return <td key={`u-col-${colId}`} className="px-6 py-3"></td>;
                }
            })}
            <td className="px-6 py-3 border-r border-gray-50 dark:border-gray-800/50"></td>
        </tr>
    );
}
