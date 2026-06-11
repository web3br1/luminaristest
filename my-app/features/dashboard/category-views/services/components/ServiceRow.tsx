'use client';

/**
 * ServiceRow - Linha de serviço individual
 *
 * @description
 * Schema-driven row: price, cost, category e qualquer campo extra são todos
 * renderizados pelo mesmo caminho genérico via `renderTypedValue` + schema.
 * Apenas três casos são mantidos hardcoded por exigirem layout visual especial:
 *   - `service`   → nome em bold uppercase com badge de ícone
 *   - `duration`  → ícone de relógio + texto
 *   - `status`    → badge colorido ativo/inativo
 *   - `actions`   → botões edit/delete
 */

import React, { useMemo } from 'react';
import { useTranslation } from 'next-i18next';
import { MdAccessTime } from 'react-icons/md';
import { RelationCell } from '../../shared/components/RelationCell';
import { RowActionsCell } from '../../shared/components/RowActionsCell';
import { useRenderTypedValue } from '../../../shared/hooks/useRenderTypedValue';
import type { ServiceRecord } from '../hooks/useServicesData';
import type { ITableSchema, ISchemaField } from '../../../components/shared/dynamic-tables.client';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface ServiceRowProps {
    /** Registro do serviço */
    service: ServiceRecord;
    /** ID da tabela de serviços */
    tableId: string | null;
    /** Schema da tabela — única fonte de verdade para tipos e numberFormat */
    schema: ITableSchema | null;
    /** Indica se a tabela está no modo resumido de widget */
    isWidgetMode?: boolean;
    /** Array de IDs das colunas ordenadas que estão visíveis */
    orderedCols: string[];
    /** Callback para atualizar lista após edição */
    onEditSuccess?: () => void;
    /** Callback para inativar registro */
    onDeleteClick?: (record: ServiceRecord) => void;
    /** Relation lookups: fieldName → Map<recordId, displayLabel> */
    serviceRelationLookups?: Record<string, Map<string, string>>;
}

// ─────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────

export function ServiceRow({
    service,
    tableId,
    schema,
    isWidgetMode = false,
    orderedCols,
    onEditSuccess,
    onDeleteClick,
    serviceRelationLookups = {},
}: ServiceRowProps) {
    const { t } = useTranslation(['common', 'database']);
    const renderTypedValue = useRenderTypedValue();

    const d = service.data || {};
    const name = String(d.name || d.serviceName || '—');
    const dur = d.duration ? String(d.duration) : '—';
    const isActive = d.isActive !== false;

    type NumberFormat = 'currency' | 'percentage' | 'integer' | 'decimal' | undefined;

    const { numberFormatMap, fieldTypeMap } = useMemo(() => {
        const numFmt = new Map<string, NumberFormat>();
        const fldType = new Map<string, string>();
        if (schema) {
            for (const f of schema.fields) {
                numFmt.set(f.name, (f as ISchemaField & { numberFormat?: NumberFormat }).numberFormat);
                fldType.set(f.name, f.type ?? 'text');
            }
        }
        return { numberFormatMap: numFmt, fieldTypeMap: fldType };
    }, [schema]);

    return (
        <tr className="group bg-gray-50/50 dark:bg-neutral-800/20 border-t-2 border-gray-200 dark:border-gray-800 hover:bg-gray-100/50 dark:hover:bg-neutral-800/40 transition-colors">
            {orderedCols.map((colId) => {
                switch (colId) {
                    // ── Special layout: service name ──────────────────
                    case 'service':
                        return (
                            <td key="col-service" className="px-2 py-3 truncate">
                                <span className="text-sm font-black text-gray-900 dark:text-white uppercase tracking-tight truncate max-w-full inline-block" title={name}>
                                    {name}
                                </span>
                            </td>
                        );

                    // ── Special visual: clock icon ────────────────────
                    case 'duration':
                        return (
                            <td key="col-duration" className="px-2 py-3 text-center whitespace-nowrap">
                                <div className="flex items-center justify-center gap-1.5 text-xs font-bold text-gray-500">
                                    <MdAccessTime size={14} className="text-gray-400" />
                                    {dur}
                                </div>
                            </td>
                        );

                    // ── Special visual: status badge ──────────────────
                    case 'status':
                        return (
                            <td key="col-status" className="px-2 py-3 text-center">
                                <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-black uppercase ${isActive ? 'text-green-600 bg-green-50 dark:bg-green-950/30' : 'text-red-600 bg-red-50 dark:bg-red-950/30'}`}>
                                    {isActive ? t('database:options.Active') : t('database:options.Inactive')}
                                </span>
                            </td>
                        );

                    // ── Actions ───────────────────────────────────────
                    case 'actions':
                        return (
                            <RowActionsCell
                                tableId={tableId ?? ''}
                                tableSchema={schema}
                                record={service}
                                onEditSuccess={onEditSuccess ?? (() => {})}
                                onDeleteClick={onDeleteClick ? () => onDeleteClick(service) : undefined}
                                isWidgetMode={isWidgetMode}
                                stopPropagation
                            />
                        );

                    // ── Generic data path: schema-driven ─────────────
                    default: {
                        const val = d[colId as keyof typeof d];
                        const fieldType = fieldTypeMap.get(colId);
                        const numberFormat = numberFormatMap.get(colId);
                        const lookup = serviceRelationLookups[colId];

                        let display: string | React.ReactNode;
                        if (val == null || val === '') {
                            display = '—';
                        } else if (lookup) {
                            display = <RelationCell value={val} lookup={lookup} />;
                        } else {
                            display = renderTypedValue(val, fieldType, { numberFormat });
                        }

                        const isNumeric = fieldType === 'number';
                        const isBoolean = fieldType === 'boolean';
                        const isCurrency = numberFormat === 'currency';

                        const tdClass = `px-2 py-3 text-xs truncate ${isNumeric ? 'text-right' : isBoolean ? 'text-center' : ''}`;
                        const spanClass = isCurrency
                            ? 'font-black text-gray-900 dark:text-white tabular-nums'
                            : isNumeric
                                ? 'font-bold text-gray-700 dark:text-gray-300 tabular-nums'
                                : 'text-gray-600 dark:text-gray-400 truncate max-w-full inline-block';

                        return (
                            <td key={`col-${colId}`} className={tdClass}>
                                <span className={spanClass} title={!isNumeric && typeof display === 'string' && display !== '—' ? display : undefined}>
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
    );
}
