'use client';

/**
 * RowActionsCell — célula de ações padronizada para tabelas ERP.
 *
 * @description
 * Consolida o par EditRecordButton + botão de exclusão que estava duplicado
 * em ServiceRow, ProductRow, PeopleRow, UnitStockRow e GenericRow.
 *
 * Retorna null em widget mode — os componentes pai não precisam de guard extra.
 */

import React from 'react';
import { useTranslation } from 'next-i18next';
import { MdDelete } from 'react-icons/md';
import EditRecordButton from '../../../components/shared/EditRecordButton';
import type { ITableSchema, IDynamicTableData } from '../../../components/shared/dynamic-tables.client';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface RowActionsCellProps {
    // ── Edit ──────────────────────────────────────────────────
    tableId: string;
    /**
     * Schema da tabela. Aceita `unknown` para permitir callers que passam schemas
     * com tipagens diferentes (`ITableSchema | null | undefined`). EditRecordButton
     * trata internamente. Substitui o `any` anterior.
     */
    tableSchema: ITableSchema | unknown;
    /** Record sendo renderizado. Estruturalmente compatível com IDynamicTableData. */
    record: IDynamicTableData;
    onEditSuccess: () => void;
    tableName?: string;
    tableInternalName?: string;

    // ── Delete ────────────────────────────────────────────────
    /** undefined = sem botão de delete */
    onDeleteClick?: () => void;
    deleteTitle?: string;

    // ── Layout ────────────────────────────────────────────────
    isWidgetMode?: boolean;
    /** true em linhas clicáveis (ex: ProductRow que expande inline) */
    stopPropagation?: boolean;
    tdClassName?: string;
}

// ─────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────

export function RowActionsCell({
    tableId,
    tableSchema,
    record,
    onEditSuccess,
    tableName,
    tableInternalName,
    onDeleteClick,
    deleteTitle,
    isWidgetMode = false,
    stopPropagation = false,
    tdClassName = '',
}: RowActionsCellProps) {
    const { t } = useTranslation(['common']);

    if (isWidgetMode) return null;

    return (
        <td
            key="col-actions"
            className={`px-2 py-3 text-center ${tdClassName}`}
            onClick={stopPropagation ? (e) => e.stopPropagation() : undefined}
        >
            <div className="flex items-center justify-center gap-1 w-full relative z-30">
                <EditRecordButton
                    tableId={tableId}
                    /* Boundary cast — RowActionsCell aceita tableSchema com tipagens
                     * heterogêneas (callers passam ITableSchema | null | unknown).
                     * EditRecordButton internamente lida com schemas inválidos. */
                    tableSchema={tableSchema as ITableSchema}
                    record={record}
                    onSuccess={onEditSuccess}
                    tableName={tableName}
                    tableInternalName={tableInternalName}
                    className="text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30"
                />
                {onDeleteClick && (
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onDeleteClick();
                        }}
                        className="p-2 rounded-full text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/30 transition-colors"
                        title={deleteTitle ?? t('inactivate_record', 'Inactivate')}
                    >
                        <MdDelete className="h-5 w-5" />
                    </button>
                )}
            </div>
        </td>
    );
}
