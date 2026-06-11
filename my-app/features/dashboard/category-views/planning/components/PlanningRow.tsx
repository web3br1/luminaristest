'use client';

import React, { useMemo } from 'react';
import { useTranslation } from 'next-i18next';
import { MdEvent } from 'react-icons/md';
import { useRenderTypedValue } from '../../../shared/hooks/useRenderTypedValue';
import { RelationCell } from '../../shared/components/RelationCell';
import { RowActionsCell } from '../../shared/components/RowActionsCell';
import type { ITableSchema, ISchemaField, IDynamicTableData } from '../../../components/shared/dynamic-tables.client';

// ─────────────────────────────────────────────────────────────
// Module-level constants
// ─────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
    Scheduled: 'text-blue-600 bg-blue-50 dark:bg-blue-900/30 border-blue-100 dark:border-blue-800',
    Completed: 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 border-emerald-100 dark:border-emerald-800',
    'No-Show': 'text-amber-600 bg-amber-50 dark:bg-amber-900/30 border-amber-100 dark:border-amber-800',
    Cancelled: 'text-red-600 bg-red-50 dark:bg-red-900/30 border-red-100 dark:border-red-800',
};

// ─────────────────────────────────────────────────────────────

interface PlanningRowProps {
    record: IDynamicTableData;
    columns: { id: string; type?: string }[];
    schema?: ITableSchema;
    tableId?: string;
    onSelect: (record: IDynamicTableData) => void;
    onEditSuccess?: () => void;
    onDeleteClick?: (record: IDynamicTableData) => void;
    colWidths: Record<string, number>;
    relationLookups?: Record<string, Map<string, string>>;
    isWidgetMode?: boolean;
}

export function PlanningRow({
    record,
    columns,
    schema,
    tableId,
    onSelect,
    onEditSuccess,
    onDeleteClick,
    colWidths,
    relationLookups = {},
    isWidgetMode = false
}: PlanningRowProps) {
    const { t } = useTranslation(['common', 'database']);
    const d = record.data || {};

    const renderTypedValue = useRenderTypedValue();

    const { numberFormatMap, fieldTypeMap } = useMemo(() => {
        const numFmt = new Map<string, ISchemaField['numberFormat']>();
        const fldType = new Map<string, string>();
        if (schema?.fields) {
            for (const f of schema.fields) {
                numFmt.set(f.name, f.numberFormat);
                fldType.set(f.name, f.type ?? 'text');
            }
        }
        return { numberFormatMap: numFmt, fieldTypeMap: fldType };
    }, [schema]);

    return (
        <tr
            onClick={() => onSelect(record)}
            className="group bg-gray-50/50 dark:bg-neutral-800/20 border-t-2 border-gray-200 dark:border-gray-800 hover:bg-gray-100/50 dark:hover:bg-neutral-800/40 transition-colors cursor-pointer"
        >
            {columns.map((col) => {
                // ── Actions ────────────────────────────────────────
                if (col.id === 'actions') {
                    return (
                        <RowActionsCell
                            key="col-actions"
                            tableId={tableId ?? ''}
                            tableSchema={schema}
                            record={{ id: record.id, data: record.data ?? {} }}
                            onEditSuccess={onEditSuccess ?? (() => {})}
                            onDeleteClick={onDeleteClick ? () => onDeleteClick(record) : undefined}
                            isWidgetMode={isWidgetMode}
                            stopPropagation
                        />
                    );
                }

                const colId = col.id;
                const width = colWidths[colId];
                const tdStyle = { width, minWidth: width, maxWidth: width };
                const val = d[colId];
                const fieldType = fieldTypeMap.get(colId) ?? col.type ?? 'text';

                // Build content via inline switch — Gold Standard pattern (no separate function)
                let content: React.ReactNode;

                if (colId === 'name' || colId === 'title') {
                    // ── Primary field (Name/Title) ─────────────────
                    content = (
                        <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 shrink-0">
                                <MdEvent size={18} />
                            </div>
                            <span className="text-sm font-bold text-gray-900 dark:text-white truncate">
                                {val ? String(val) : t('common:no_title', 'Sem título')}
                            </span>
                        </div>
                    );
                } else if (fieldType === 'select' || colId === 'status' || colId === 'appointmentStatus') {
                    // ── Status / Select badge ─────────────────────
                    const status = String(val || '');
                    content = (
                        <div className="flex justify-center">
                            <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-black uppercase border ${STATUS_COLORS[status] || 'text-gray-500 bg-gray-50 border-gray-100'}`}>
                                {String(t(`database:options.${status}`, status))}
                            </span>
                        </div>
                    );
                } else if (val == null || val === '') {
                    // ── Empty value ────────────────────────────────
                    content = <span className="text-gray-400 dark:text-gray-600">—</span>;
                } else if (fieldType === 'date' || fieldType === 'datetime') {
                    // ── Date / DateTime ────────────────────────────
                    content = (
                        <span className="text-xs text-gray-600 dark:text-gray-400">
                            {renderTypedValue(val, fieldType)}
                        </span>
                    );
                } else if (fieldType === 'relation') {
                    // ── Relation ──────────────────────────────────
                    const lookup = relationLookups[colId];
                    content = lookup
                        ? <RelationCell value={val} lookup={lookup} />
                        : <span className="text-xs text-gray-400 dark:text-gray-600">{String(val)}</span>;
                } else if (fieldType === 'boolean') {
                    // ── Boolean badge ─────────────────────────────
                    content = (
                        <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${val ? 'bg-green-100 text-green-700 dark:bg-green-900/30' : 'bg-gray-100 text-gray-500 dark:bg-neutral-800'}`}>
                            {val ? t('common:yes', 'Sim') : t('common:no', 'Não')}
                        </span>
                    );
                } else if (fieldType === 'number') {
                    // ── Number — locale-aware ─────────────────────
                    const numFmt = numberFormatMap.get(colId);
                    const formatted = renderTypedValue(val, 'number', { numberFormat: numFmt });
                    const isCurrency = numFmt === 'currency';
                    content = (
                        <span className={`text-xs tabular-nums ${isCurrency ? 'font-black text-gray-900 dark:text-white' : 'font-bold text-gray-700 dark:text-gray-300'}`}>
                            {formatted}
                        </span>
                    );
                } else if (fieldType === 'enum') {
                    // ── Enum — blue badge (consistent with GenericRow) ──
                    const label = renderTypedValue(val, 'enum');
                    content = (
                        <span
                            className="text-[10px] font-bold text-blue-500/80 uppercase tracking-tighter bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 rounded truncate max-w-full inline-block"
                            title={typeof label === 'string' ? label : undefined}
                        >
                            {label}
                        </span>
                    );
                } else {
                    // ── Default fallback ──────────────────────────
                    content = (
                        <span className="text-xs text-gray-500 dark:text-gray-400 truncate">
                            {String(val)}
                        </span>
                    );
                }

                return (
                    <td key={colId} className="px-4 py-3 truncate" style={tdStyle}>
                        {content}
                    </td>
                );
            })}
            <td className="px-2 py-3" />
        </tr>
    );
}
