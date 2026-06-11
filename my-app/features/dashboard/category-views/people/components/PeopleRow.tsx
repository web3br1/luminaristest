'use client';

/**
 * PeopleRow - Linha de pessoa individual
 *
 * @description
 * Renderiza os dados de uma pessoa em uma linha de tabela no modo List.
 * Segue o Padrão Ouro visual (fundo, hover, borda, filler) de ProductRow/ServiceRow.
 * Clicar na linha abre a GenericDataSidebar (não expande inline).
 */

import React, { useMemo } from 'react';
import { useTranslation } from 'next-i18next';
import type { PersonRecord } from '../hooks/usePeopleData';
import { RelationCell } from '../../shared/components/RelationCell';
import { RowActionsCell } from '../../shared/components/RowActionsCell';
import { type ITableSchema, type ISchemaField } from '../../../components/shared/dynamic-tables.client';
import { useRenderTypedValue } from '../../../shared/hooks/useRenderTypedValue';
import { getInitials, getAvatarColor } from '../utils/people-display';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

type NumberFormat = 'currency' | 'percentage' | 'integer' | 'decimal' | undefined;

interface PeopleRowProps {
    /** Registro da pessoa */
    person: PersonRecord;
    /** Array de IDs das colunas ordenadas e visíveis */
    orderedCols: string[];
    /** Indica se está no modo widget (sem ações) */
    isWidgetMode?: boolean;
    /** ID da tabela ativa (para EditRecordButton) */
    tableId?: string;
    /** Schema da tabela ativa (para EditRecordButton) */
    tableSchema?: ITableSchema;
    /** Callback ao clicar na linha — abre a sidebar */
    onSelectRecord: (person: PersonRecord) => void;
    /** Callback para inativar registro */
    onDeleteClick?: (person: PersonRecord) => void;
    /** Callback após edição bem-sucedida */
    onEditSuccess?: () => void;
    /** Lookup map: fieldName → Map<recordId, displayLabel> for relation fields */
    relationLookups?: Record<string, Map<string, string>>;
}

// ─────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────

export function PeopleRow({
    person,
    orderedCols,
    isWidgetMode = false,
    tableId,
    tableSchema,
    onSelectRecord,
    onDeleteClick,
    onEditSuccess,
    relationLookups = {},
}: PeopleRowProps) {
    const { t } = useTranslation(['common', 'database']);
    const renderTypedValue = useRenderTypedValue();

    const d = person.data || {};
    const isActive = person.isActive;

    const { numberFormatMap, fieldTypeMap } = useMemo(() => {
        const numFmt = new Map<string, NumberFormat>();
        const fldType = new Map<string, string>();
        if (tableSchema) {
            for (const f of tableSchema.fields) {
                numFmt.set(f.name, (f as ISchemaField & { numberFormat?: NumberFormat }).numberFormat);
                fldType.set(f.name, f.type ?? 'text');
            }
        }
        return { numberFormatMap: numFmt, fieldTypeMap: fldType };
    }, [tableSchema]);

    return (
        <tr
            onClick={() => onSelectRecord(person)}
            className="group bg-gray-50/50 dark:bg-neutral-800/20 border-t-2 border-gray-200 dark:border-gray-800 hover:bg-gray-100/50 dark:hover:bg-neutral-800/40 transition-colors cursor-pointer"
        >
            {orderedCols.map((colId) => {
                switch (colId) {
                    case 'name':
                        return (
                            <td key="col-name" className="px-2 py-3 truncate">
                                <div className="flex items-center gap-3">
                                    {/* Avatar */}
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-black shrink-0 ${getAvatarColor(person.name)}`}>
                                        {getInitials(person.name)}
                                    </div>
                                    <div className="flex flex-col min-w-0">
                                        <span className="text-sm font-black text-gray-900 dark:text-white uppercase tracking-tight truncate" title={person.name}>
                                            {person.name}
                                        </span>
                                        {person.role && (
                                            <span className="text-[10px] font-bold text-gray-400 uppercase tracking-tighter truncate" title={person.role}>
                                                {person.role}
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </td>
                        );
                    case 'contact':
                        return (
                            <td key="col-contact" className="px-2 py-3 truncate">
                                <div className="flex flex-col gap-0.5 text-xs text-gray-600 dark:text-gray-400">
                                    {person.email && (
                                        <span className="truncate" title={person.email}>{person.email}</span>
                                    )}
                                    {person.phone && (
                                        <span className="text-[11px] text-gray-400 truncate" title={person.phone}>{person.phone}</span>
                                    )}
                                    {!person.email && !person.phone && (
                                        <span className="text-gray-300 dark:text-gray-600">—</span>
                                    )}
                                </div>
                            </td>
                        );
                    case 'role':
                        return (
                            <td key="col-role" className="px-2 py-3 truncate text-center">
                                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-tighter truncate max-w-full inline-block" title={person.role || undefined}>
                                    {person.role || '—'}
                                </span>
                            </td>
                        );
                    case 'status':
                        return (
                            <td key="col-status" className="px-2 py-3 text-center">
                                <span className={`inline-flex px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                                    isActive
                                        ? 'text-green-600 bg-green-50 dark:bg-green-950/30'
                                        : 'text-red-600 bg-red-50 dark:bg-red-950/30'
                                }`}>
                                    {isActive ? t('database:options.Active') : t('database:options.Inactive')}
                                </span>
                            </td>
                        );
                    case 'actions':
                        return (
                            <RowActionsCell
                                key="col-actions"
                                tableId={tableId ?? ''}
                                tableSchema={tableSchema}
                                record={{ id: person.id, data: person.data }}
                                onEditSuccess={onEditSuccess ?? (() => {})}
                                onDeleteClick={onDeleteClick ? () => onDeleteClick(person) : undefined}
                                isWidgetMode={isWidgetMode}
                                stopPropagation
                                tdClassName="truncate"
                            />
                        );
                    default: {
                        const val = d[colId];
                        const fieldType = fieldTypeMap.get(colId) ?? 'text';
                        const numberFormat = numberFormatMap.get(colId);
                        const lookup = relationLookups[colId];

                        let display: string | React.ReactNode;

                        if (val == null || val === '') {
                            display = '—';
                        } else if (lookup) {
                            display = <RelationCell value={val} lookup={lookup} />;
                        } else {
                            display = renderTypedValue(val, fieldType, { numberFormat });
                        }

                        const isNumeric = fieldType === 'number';
                        return (
                            <td key={`col-${colId}`} className={`px-2 py-3 text-xs truncate ${isNumeric ? 'text-right' : ''} text-gray-600 dark:text-gray-400`}>
                                <span className={`truncate max-w-full inline-block${isNumeric ? ' tabular-nums font-bold text-gray-700 dark:text-gray-300' : ''}`}>
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
