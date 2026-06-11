'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { MdHistory, MdLocationOn } from 'react-icons/md';
import { useTranslation } from 'next-i18next';
import { useFormatCurrency } from '@/lib/context/CurrencyContext';
import { useTableColumnControls } from '../../shared/hooks/useTableColumnControls';
import { CustomizeColumnsPanel } from '../../../shared/components/CustomizeColumnsPanel';
import type { IDynamicTable, IDynamicTableData, ISchemaField } from '../../../components/shared/dynamic-tables.client';
import { useRenderTypedValue } from '../../../shared/hooks/useRenderTypedValue';
import { RelationCell } from '../../shared/components/RelationCell';

// ─────────────────────────────────────────────────────────────
// Types & Constants
// ─────────────────────────────────────────────────────────────

interface InventoryHistoryTableProps {
    movements: IDynamicTableData[];
    isLoading: boolean;
    productNameMap: Record<string, string>;
    unitNameMap: Record<string, string>;
    movementsRelationLookups: Record<string, Map<string, string>>;
    movementsTable: IDynamicTable | null;
}

// Structural fields managed by fixed columns — never rendered as dynamic columns
// detailKey is an internal SalesPlugin deduplication key — hidden in schema, excluded here as belt-and-suspenders
const STRUCTURAL = new Set([
    'productId', 'unitId', 'type', 'quantity', 'date',
    'reason', 'cost', 'supplierId', 'paymentStatus',
    'detailKey'
]);

// Module-level locale map — avoids re-creation on each render
const LOCALE_MAP: Record<string, string> = { en: 'en-US', pt: 'pt-BR', de: 'de-DE' };

// ─────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────

export function InventoryHistoryTable({
    movements,
    isLoading,
    productNameMap,
    unitNameMap,
    movementsRelationLookups,
    movementsTable
}: InventoryHistoryTableProps) {
    const { t, i18n } = useTranslation(['inventory_view', 'common']);
    const activeLocale = LOCALE_MAP[i18n.language] || 'en-US';
    const formatCurrency = useFormatCurrency();
    const renderTypedValue = useRenderTypedValue();

    // --- Schema-driven extra columns ---
    const movementsSchema = movementsTable?.schema;
    const extraColumns = useMemo(() =>
        (movementsSchema?.fields ?? [])
            .filter((f: ISchemaField) => !STRUCTURAL.has(f.name) && !f.hidden)
            .map((f: ISchemaField) => ({
                id: f.name,
                label: f.label || f.name,
                defaultVisible: true,
                defaultWidth: 140,
                minWidth: 60
            })),
        [movementsSchema]
    );

    // --- Column Configuration ---
    const initialColumns = useMemo(() => [
        { id: 'date',     label: t('inventory_view:history.columns.moment',         'Momento'),          defaultVisible: true, defaultWidth: 110, minWidth: 80  },
        { id: 'type',     label: t('inventory_view:history.columns.flow',            'Fluxo'),            defaultVisible: true, defaultWidth: 80,  minWidth: 60  },
        { id: 'product',  label: t('inventory_view:history.columns.product_source',  'Produto / Origem'), defaultVisible: true, defaultWidth: 260, minWidth: 100 },
        { id: 'quantity', label: t('inventory_view:history.columns.qty',             'Qtd'),              defaultVisible: true, defaultWidth: 70,  minWidth: 50  },
        { id: 'cost',     label: t('inventory_view:history.columns.cost',            'Valor'),            defaultVisible: true, defaultWidth: 120, minWidth: 80  },
        { id: 'supplier', label: t('inventory_view:history.columns.supplier',        'Fornecedor'),       defaultVisible: true, defaultWidth: 150, minWidth: 80  },
        { id: 'reason',   label: t('inventory_view:history.columns.reason_status',   'Motivo / Status'),  defaultVisible: true, defaultWidth: 150, minWidth: 80  },
        ...extraColumns,
    ], [t, extraColumns]);

    const {
        columns,
        visibleCols,
        toggleColumn,
        moveColumn,
        resetColumns,
        colWidths,
        tableWidth,
        onMouseDown,
        activeResizingColId,
    } = useTableColumnControls(initialColumns, 'lum-movements-grid-config');

    // --- Portal for CustomizeColumnsPanel ---
    const [isCustomizeOpen, setIsCustomizeOpen] = useState(false);
    const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);
    useEffect(() => {
        setPortalRoot(document.getElementById('inventory-table-actions-portal'));
    }, []);

    // --- Loading & Empty States ---
    if (isLoading) {
        return (
            <div className="flex flex-col items-center gap-3 py-24">
                <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                    {t('inventory_view:history.syncing', 'Sincronizando auditoria...')}
                </span>
            </div>
        );
    }

    if (movements.length === 0) {
        return (
            <div className="max-w-xs mx-auto py-24 text-center">
                <MdHistory size={48} className="mx-auto text-gray-200 dark:text-gray-800 mb-4" />
                <h3 className="text-sm font-bold text-gray-900 dark:text-white uppercase mb-2">
                    {t('inventory_view:history.no_movements', 'Sem movimentações')}
                </h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed font-semibold italic">
                    {t('inventory_view:history.no_movements_desc', 'Nenhum fluxo de entrada ou saída foi registrado até o momento.')}
                </p>
            </div>
        );
    }

    return (
        <>
            {portalRoot && createPortal(
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
                    <table
                        className="min-w-full divide-y divide-gray-200 dark:divide-gray-800 border-collapse table-fixed"
                        style={{ width: `max(100%, ${tableWidth}px)` }}
                    >
                        <colgroup>
                            {columns.map(col => {
                                if (!visibleCols.has(col.id)) return null;
                                const width = colWidths[col.id];
                                return <col key={`col-${col.id}`} style={{ width, minWidth: width, maxWidth: width }} />;
                            })}
                            <col style={{ width: 'auto' }} />
                        </colgroup>

                        <thead className="bg-gray-100/50 dark:bg-neutral-800/50 sticky top-0 z-10 w-full shadow-sm">
                            <tr>
                                {columns.filter(c => visibleCols.has(c.id)).map(col => (
                                    <th
                                        key={col.id}
                                        className="relative group px-2 py-3 text-left text-[11px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-wider border-b border-gray-200 dark:border-gray-800 select-none"
                                        style={{ width: colWidths[col.id] || col.defaultWidth }}
                                    >
                                        <span className="truncate">{col.label}</span>
                                        <div
                                            className={`absolute right-0 top-1.5 bottom-1.5 w-1 cursor-col-resize z-20 touch-none rounded-full transition-colors duration-200 ${activeResizingColId === col.id ? 'bg-blue-600 scale-x-150' : 'bg-transparent group-hover:bg-gray-300 dark:group-hover:bg-neutral-700 hover:!bg-blue-500'}`}
                                            onMouseDown={(e) => { e.stopPropagation(); onMouseDown(e, col.id); }}
                                        />
                                    </th>
                                ))}
                                {/* Filler header */}
                                <th className="px-2 py-3 border-b border-gray-200 dark:border-gray-800" />
                            </tr>
                        </thead>

                        <tbody className="divide-y divide-gray-50 dark:divide-gray-800 bg-white dark:bg-neutral-900">
                            {movements.map((mv: IDynamicTableData) => {
                                const d = mv.data;
                                const date = d.date
                                    ? new Date(String(d.date)).toLocaleString(activeLocale, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
                                    : '—';
                                const type     = String(d.type || 'In');
                                const pid      = String((d.productId as Record<string, unknown>)?.id ?? d.productId ?? '');
                                const uid      = String((d.unitId    as Record<string, unknown>)?.id ?? d.unitId    ?? '');
                                const prod     = productNameMap[pid]  || t('inventory_view:history.unknown',      'Desconhecido');
                                const unit     = unitNameMap[uid]     || t('inventory_view:history.general_unit', 'Unidade Geral');
                                const qty      = Number(d.quantity || 0);
                                const reason   = String(d.reason || 'S/M');
                                const status   = String(d.paymentStatus || '');
                                const cost     = Number(d.cost || 0);
                                const translatedReason = t(`inventory_view:reasons.${reason}`, reason);

                                return (
                                    <tr key={mv.id} className="group hover:bg-gray-50/50 dark:hover:bg-neutral-800/40 transition-colors">
                                        {columns.filter(c => visibleCols.has(c.id)).map(col => {
                                            switch (col.id) {
                                                case 'date':
                                                    return (
                                                        <td key={col.id} className="px-2 py-3 whitespace-nowrap">
                                                            <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 font-mono tracking-tighter uppercase">{date}</span>
                                                        </td>
                                                    );
                                                case 'type':
                                                    return (
                                                        <td key={col.id} className="px-2 py-3 text-center">
                                                            <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-black uppercase ${type === 'In' ? 'text-green-600 bg-green-50 dark:bg-green-950/30' : 'text-red-600 bg-red-50 dark:bg-red-950/30'}`}>
                                                                {type === 'In' ? t('inventory_view:movements.in', 'Entrada') : t('inventory_view:movements.out', 'Saída')}
                                                            </span>
                                                        </td>
                                                    );
                                                case 'product':
                                                    return (
                                                        <td key={col.id} className="px-2 py-3">
                                                            <div className="flex flex-col text-left">
                                                                <span className="text-sm font-black text-gray-900 dark:text-white uppercase tracking-tight truncate max-w-[250px]">{prod}</span>
                                                                <div className="flex items-center gap-1 mt-0.5">
                                                                    <MdLocationOn size={12} className="text-blue-400/70" />
                                                                    <span className="text-[10px] font-bold uppercase tracking-tight text-gray-400 dark:text-gray-500">{unit}</span>
                                                                </div>
                                                            </div>
                                                        </td>
                                                    );
                                                case 'quantity':
                                                    return (
                                                        <td key={col.id} className="px-2 py-3 text-right">
                                                            <span className={`text-sm font-black tracking-tighter ${type === 'In' ? 'text-blue-600 dark:text-blue-400' : 'text-gray-700 dark:text-gray-200'}`}>
                                                                {type === 'In' ? `+${qty}` : `-${qty}`}
                                                            </span>
                                                        </td>
                                                    );
                                                case 'cost':
                                                    return (
                                                        <td key={col.id} className="px-2 py-3 text-right whitespace-nowrap">
                                                            {cost > 0 ? (
                                                                <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                                                                    {formatCurrency(cost)}
                                                                </span>
                                                            ) : (
                                                                <span className="text-xs text-gray-300 dark:text-gray-700">—</span>
                                                            )}
                                                        </td>
                                                    );
                                                case 'supplier':
                                                    return (
                                                        <td key={col.id} className="px-2 py-3">
                                                            <RelationCell
                                                                value={d.supplierId}
                                                                lookup={movementsRelationLookups['supplierId']}
                                                            />
                                                        </td>
                                                    );
                                                case 'reason':
                                                    return (
                                                        <td key={col.id} className="px-2 py-3">
                                                            <div className="flex items-center gap-3">
                                                                <span className="text-[10px] font-bold text-gray-500 dark:text-gray-400 uppercase bg-gray-100 dark:bg-neutral-800 px-2 py-0.5 rounded tracking-tighter">
                                                                    {translatedReason}
                                                                </span>
                                                                {status && (
                                                                    <span className="text-[9px] font-black text-blue-500/80 uppercase tracking-widest">{status}</span>
                                                                )}
                                                            </div>
                                                        </td>
                                                    );
                                                default: {
                                                    // Schema-driven dynamic column
                                                    const field = movementsSchema?.fields?.find((f: ISchemaField) => f.name === col.id);
                                                    const value = d[col.id];
                                                    if (field?.type === 'relation') {
                                                        return (
                                                            <td key={col.id} className="px-2 py-3">
                                                                <RelationCell
                                                                    value={value}
                                                                    lookup={movementsRelationLookups[col.id]}
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
                                            }
                                        })}
                                        {/* Filler cell */}
                                        <td className="px-2 py-3" />
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>
        </>
    );
}

export default InventoryHistoryTable;
