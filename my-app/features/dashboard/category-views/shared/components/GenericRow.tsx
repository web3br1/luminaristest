'use client';

/**
 * GenericRow — Linha de renderizacao para a GenericTable
 *
 * @description
 * Renderiza uma unica linha de dados para qualquer schema dinamico.
 * Usa dispatch por TIPO de campo (nao por nome fixo) e resolve relations
 * via RelationCell — mesmo padrao Gold Standard de ServiceRow / ProductRow.
 *
 * Ordem de despacho no switch por tipo:
 *   1. actions        -> RowActionsCell
 *   2. relation       -> RelationCell (badge + popover ERP-style)
 *   3. boolean        -> badge verde/vermelho
 *   4. number         -> renderTypedValue com numberFormat do schema (locale-aware)
 *   5. date/datetime  -> renderTypedValue (locale do usuario via CurrencyContext)
 *   6. enum           -> badge azul
 *   7. object/array   -> resumo simples
 *   8. default        -> String(val) com bold se for o displayField
 */

import React, { useMemo } from 'react';
import { useTranslation } from 'next-i18next';
import type { ITableSchema, ISchemaField } from '../../../components/shared/dynamic-tables.client';
import type { GenericRecord } from '../hooks/useGenericData';
import { RelationCell } from './RelationCell';
import { RowActionsCell } from './RowActionsCell';
import { useRenderTypedValue } from '../../../shared/hooks/useRenderTypedValue';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface GenericRowProps {
    record: GenericRecord;
    schema: ITableSchema;
    tableId: string;
    /** Relation lookups: fieldName -> Map<recordId, displayLabel> */
    relationLookups: Record<string, Map<string, string>>;
    /** Ordered list of column IDs that are currently visible */
    orderedCols: string[];
    isWidgetMode?: boolean;
    /** Called after a successful edit */
    onEditSuccess: () => void;
    /** Called to initiate soft delete (actual HTTP delegated to GenericTable) */
    onDeleteClick: (record: GenericRecord) => void;
}

// ─────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────

export function GenericRow({
    record,
    schema,
    tableId,
    relationLookups,
    orderedCols,
    isWidgetMode = false,
    onEditSuccess,
    onDeleteClick,
}: GenericRowProps) {
    const { t } = useTranslation(['common', 'database']);
    // CORRECT: hook injects user locale and currency from CurrencyContext
    const renderTypedValue = useRenderTypedValue();
    const d = record.data || {};

    // Field def map memoizado — consistente com ProductRow/ServiceRow/PeopleRow/ExpensesRow
    const fieldDefMap = useMemo(() => {
        const map = new Map<string, ISchemaField>();
        for (const f of schema.fields) {
            map.set(f.name, f);
        }
        return map;
    }, [schema]);

    const displayField = schema.defaultDisplayField || 'name';

    return (
        <tr className="group bg-gray-50/50 dark:bg-neutral-800/20 border-t-2 border-gray-200 dark:border-gray-800 hover:bg-gray-100/50 dark:hover:bg-neutral-800/40 transition-colors">
            {orderedCols.map((colId) => {

                // ── Actions column ────────────────────────────────────────
                if (colId === 'actions') {
                    return (
                        <RowActionsCell
                            key="col-actions"
                            tableId={tableId}
                            tableSchema={schema}
                            record={record}
                            onEditSuccess={onEditSuccess}
                            onDeleteClick={() => onDeleteClick(record)}
                            isWidgetMode={isWidgetMode}
                            stopPropagation
                        />
                    );
                }

                const val = d[colId];
                const fieldDef = fieldDefMap.get(colId);
                const fieldType: string = fieldDef?.type ?? 'string';
                const isDisplayField = colId === displayField;

                // ── JSON: nunca exibir raw na célula ─────────────────────
                if (fieldType === 'json') {
                    const isEmpty = val == null || val === '' || val === '{}' || val === '[]';
                    return (
                        <td key={`col-${colId}`} className="px-2 py-3 text-center">
                            {isEmpty
                                ? <span className="text-gray-300 dark:text-gray-600">—</span>
                                : <span className="text-[10px] font-bold text-gray-400 dark:text-gray-500 bg-gray-100 dark:bg-neutral-800 px-2 py-0.5 rounded font-mono tracking-tight">
                                    {'{ … }'}
                                  </span>
                            }
                        </td>
                    );
                }

                // ── Empty value ───────────────────────────────────────────
                if (val == null || val === '') {
                    return (
                        <td key={`col-${colId}`} className="px-2 py-3 text-xs text-gray-400 dark:text-gray-600">
                            {'—'}
                        </td>
                    );
                }

                // ── Relation: RelationCell (badge + popover) ──────────────
                if (fieldType === 'relation') {
                    const lookup = relationLookups[colId];
                    return (
                        <td key={`col-${colId}`} className="px-2 py-3 text-xs text-center">
                            {lookup
                                ? <RelationCell value={val} lookup={lookup} />
                                : <span className="text-gray-400 dark:text-gray-600 text-[10px]">{String(val)}</span>
                            }
                        </td>
                    );
                }

                // ── Boolean: green/red badge ──────────────────────────────
                if (fieldType === 'boolean') {
                    return (
                        <td key={`col-${colId}`} className="px-2 py-3 text-center">
                            <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-black uppercase ${val ? 'text-green-600 bg-green-50 dark:bg-green-950/30' : 'text-red-600 bg-red-50 dark:bg-red-950/30'}`}>
                                {val ? t('yes', 'Yes') : t('no', 'No')}
                            </span>
                        </td>
                    );
                }

                // ── Number: locale-aware via useRenderTypedValue ───────────
                if (fieldType === 'number') {
                    const formatted = renderTypedValue(val, 'number', {
                        numberFormat: fieldDef?.numberFormat,
                    });
                    const isCurrency = fieldDef?.numberFormat === 'currency';
                    return (
                        <td key={`col-${colId}`} className="px-2 py-3 text-xs text-right truncate tabular-nums">
                            <span className={isCurrency
                                ? 'font-black text-gray-900 dark:text-white tabular-nums'
                                : 'font-bold text-gray-700 dark:text-gray-300 tabular-nums'
                            }>
                                {formatted}
                            </span>
                        </td>
                    );
                }

                // ── Date / Datetime: locale-aware via useRenderTypedValue ──
                if (fieldType === 'date' || fieldType === 'datetime') {
                    const formatted = renderTypedValue(val, fieldType);
                    return (
                        <td key={`col-${colId}`} className="px-2 py-3 text-xs text-gray-600 dark:text-gray-400 truncate">
                            {formatted}
                        </td>
                    );
                }

                // ── Enum: blue badge ──────────────────────────────────────
                if (fieldType === 'enum') {
                    const label = renderTypedValue(val, 'enum');
                    return (
                        <td key={`col-${colId}`} className="px-2 py-3 text-center">
                            <span
                                className="text-[10px] font-bold text-blue-500/80 uppercase tracking-tighter bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 rounded truncate max-w-full inline-block"
                                title={typeof label === 'string' ? label : undefined}
                            >
                                {label}
                            </span>
                        </td>
                    );
                }

                // ── Object / Array: safe summary ──────────────────────────
                if (typeof val === 'object') {
                    return (
                        <td key={`col-${colId}`} className="px-2 py-3 text-xs text-gray-400 dark:text-gray-600 text-center">
                            {Array.isArray(val) ? `[${(val as unknown[]).length}]` : '—'}
                        </td>
                    );
                }

                // ── Default: plain string / unknown type ──────────────────
                const display = String(val);
                return (
                    <td
                        key={`col-${colId}`}
                        className={`px-2 py-3 text-xs truncate max-w-[240px] ${
                            isDisplayField
                                ? 'font-black text-gray-900 dark:text-white uppercase tracking-tight text-sm'
                                : 'text-gray-600 dark:text-gray-400'
                        }`}
                    >
                        <span
                            className="truncate max-w-full inline-block"
                            title={display !== '—' ? display : undefined}
                        >
                            {display}
                        </span>
                    </td>
                );
            })}
            {/* Filler cell to absorb remaining grid space */}
            <td className="px-2 py-3" />
        </tr>
    );
}

export default GenericRow;
