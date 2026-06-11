'use client';

import React, { useMemo } from 'react';
import { useTranslation } from 'next-i18next';
import { ExpenseRecord } from '../../types/expenses.types';
import type { ISchemaField } from '@/features/dashboard/components/shared/dynamic-tables.client';
import { useRenderTypedValue } from '@/features/dashboard/shared/hooks/useRenderTypedValue';
import { RelationCell } from '@/features/dashboard/category-views/shared/components/RelationCell';
import { RowActionsCell } from '@/features/dashboard/category-views/shared/components/RowActionsCell';
import {
    getStatusBadgeClasses,
    getStatusColorScheme,
} from '@/features/dashboard/shared/utils/formatters';
import type { ExpensesColumn } from './ExpensesTable';

interface ExpensesRowProps {
    record: ExpenseRecord;
    columns: ExpensesColumn[];
    schema?: ISchemaField[];
    tableId?: string;
    tableSchema?: unknown;
    onSelect: (record: ExpenseRecord) => void;
    onEditSuccess?: () => void;
    onDeleteClick?: (record: ExpenseRecord) => void;
    colWidths: Record<string, number>;
    relationLookups: Record<string, Map<string, string>>;
    isWidgetMode?: boolean;
}

export function ExpensesRow({
    record,
    columns,
    schema,
    tableId,
    tableSchema,
    onSelect,
    onEditSuccess,
    onDeleteClick,
    colWidths,
    relationLookups,
    isWidgetMode = false,
}: ExpensesRowProps) {
    const { t } = useTranslation(['common', 'database', 'finance_view']);
    const data = record.data || {};
    const renderTypedValue = useRenderTypedValue();

    // Memoized numberFormat map — avoids rebuild on every render.
    // ISchemaField.numberFormat is a first-class property after Stage 1 — no cast needed.
    const numberFormatMap = useMemo(() => {
        const map = new Map<string, ISchemaField['numberFormat']>();
        if (schema) {
            for (const f of schema) {
                map.set(f.name, f.numberFormat);
            }
        }
        return map;
    }, [schema]);

    return (
        <tr
            onClick={() => onSelect(record)}
            className="group hover:bg-blue-50/40 dark:hover:bg-blue-500/5 transition-colors cursor-pointer border-b border-gray-100 dark:border-gray-800/50 last:border-0"
        >
            {columns.map((col) => {
                if (col.id === 'actions') {
                    return (
                        <RowActionsCell
                            key="col-actions"
                            tableId={tableId ?? ''}
                            tableSchema={tableSchema}
                            record={record}
                            onEditSuccess={onEditSuccess ?? (() => {})}
                            onDeleteClick={onDeleteClick ? () => onDeleteClick(record) : undefined}
                            isWidgetMode={isWidgetMode ?? false}
                            stopPropagation
                        />
                    );
                }

                const value = data[col.id];
                const width = colWidths[col.id];
                const colNumberFormat = numberFormatMap.get(col.id);
                const isCenter = col.id === 'isPlanned' || col.id === 'paymentStatus' || col.id === 'category' || col.id === 'status';
                const isRight = colNumberFormat === 'currency' || col.id.toLowerCase().includes('total');

                let content: React.ReactNode;

                // Gold Standard: switch(colId) rendering for known special fields
                switch (col.id) {
                    case 'isPlanned':
                        content = (
                            <span className={`inline-flex px-2 py-0.5 text-[10px] font-black uppercase rounded ${value
                                ? 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30'
                                : 'text-amber-600 bg-amber-50 dark:bg-amber-950/30'
                            }`}>
                                {value ? t('common:yes', 'Sim') : t('common:no', 'Não')}
                            </span>
                        );
                        break;

                    case 'paymentStatus':
                    case 'status': {
                        const status = String(value || '');
                        const scheme = getStatusColorScheme(status);
                        content = (
                            <span className={getStatusBadgeClasses(scheme)}>
                                {t(`database:fields.paymentStatus_options.${status}`, status)}
                            </span>
                        );
                        break;
                    }

                    case 'category':
                        content = (
                            <span className="text-[10px] font-bold text-blue-500/80 dark:text-blue-400/80 uppercase tracking-tighter bg-blue-50/50 dark:bg-blue-900/20 px-2 py-0.5 rounded">
                                {String(value || '—')}
                            </span>
                        );
                        break;

                    default: {
                        // Relation: RelationCell for consistent visual treatment
                        if (col.type === 'relation') {
                            const lookup = relationLookups[col.id];
                            content = lookup
                                ? <RelationCell value={value} lookup={lookup} />
                                : <span className="text-xs text-gray-400 dark:text-gray-600">{value != null ? String(value) : '—'}</span>;
                            break;
                        }
                        const isCurrency = colNumberFormat === 'currency';
                        content = (
                            <span className={`${
                                isCurrency ? 'font-black text-red-600 dark:text-red-400 tabular-nums' :
                                !isCenter && !isRight ? 'text-gray-900 dark:text-white font-medium' : ''
                            }`}>
                                {renderTypedValue(value, col.type, {
                                    numberFormat: colNumberFormat,
                                })}
                            </span>
                        );
                    }
                }

                return (
                    <td
                        key={col.id}
                        className={`px-4 py-3 whitespace-nowrap overflow-hidden text-ellipsis ${isCenter ? 'text-center' : isRight ? 'text-right' : 'text-left'}`}
                        style={{ width, minWidth: width, maxWidth: width }}
                    >
                        <div className="text-sm">
                            {content}
                        </div>
                    </td>
                );
            })}
            <td className="px-2 py-3" />
        </tr>
    );
}
