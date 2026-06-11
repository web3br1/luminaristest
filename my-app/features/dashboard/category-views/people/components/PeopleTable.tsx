'use client';

/**
 * PeopleTable - Tabela de pessoas com colunas dinâmicas
 *
 * @description
 * Gerencia o cabeçalho, redimensionamento/reordenação de colunas e renderização
 * das linhas de pessoas. Segue o Padrão Ouro de ProductsTable/ServicesTable.
 */

import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'next-i18next';
import { PeopleRow } from './PeopleRow';
import { useTableColumnControls, type ColumnDefinition } from '../../shared/hooks/useTableColumnControls';
import { useColumnSort } from '../../shared/hooks/useColumnSort';
import { MdArrowUpward, MdArrowDownward, MdUnfoldMore } from 'react-icons/md';
import type { SortOption } from '../../shared/SortSelect';
import type { PersonRecord } from '../hooks/usePeopleData';
import { ConfirmDeleteModal } from '../../../shared/components/ConfirmDeleteModal';
import { CustomizeColumnsPanel } from '../../../shared/components/CustomizeColumnsPanel';
import type { ITableSchema } from '../../../components/shared/dynamic-tables.client';

// Campos que têm colunas estruturais dedicadas:
// - name/nome/etc.        → coluna "name" (com avatar)
// - email/emailAddress/etc → coluna "contact"
// - phone/telefone/etc    → coluna "contact"
// - role/cargo/etc        → coluna "role"
// - isActive/active/etc  → coluna "status"
// - avatarUrl/avatar/etc → coluna "name" (avatar)
// - createdAt/updatedAt  → não exibidos
const STRUCTURAL = new Set([
    'name', 'nome', 'fullName', 'customerName', 'employeeName', 'supplierName', 'contactName',
    'email', 'emailAddress', 'mail', 'e-mail',
    'phone', 'telefone', 'phoneNumber', 'mobile', 'celular', 'whatsapp',
    'role', 'cargo', 'position', 'funcao', 'type', 'tipo',
    'isActive', 'active', 'ativo', 'status',
    'avatarUrl', 'avatar', 'photo', 'foto', 'image', 'imagem', 'profilePicture',
    'createdAt', 'updatedAt',
]);

// ─────────────────────────────────────────────────────────────
// Module-level constants (stable references, never recreated on render)
// ─────────────────────────────────────────────────────────────

const COL_TO_FIELD: Record<string, string> = {
    name:    'name',
    contact: 'email',
    role:    'role',
    status:  'isActive',
};



// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface PeopleTableProps {
    /** Lista de pessoas paginada */
    people: PersonRecord[];
    /** ID da tabela ativa (para Soft Delete e Edit) */
    activeTableId: string;
    /** Schema da tabela ativa (para EditRecordButton) */
    activeTableSchema?: ITableSchema;
    /** Sort control */
    activeSortConfig?: SortOption | null;
    onSortChange?: (sort: SortOption | null) => void;
    /** Indica modo widget */
    isWidgetMode?: boolean;
    /** Callback ao clicar na linha → abre sidebar */
    onSelectRecord: (person: PersonRecord) => void;
    /** Callback após inativação bem-sucedida (ex: refetch nos dados) */
    onDeleteSuccess?: () => void;
    /** Callback para confirmar exclusão (HTTP delegado ao data hook) */
    onDeleteConfirm?: (person: PersonRecord) => Promise<void>;
    /** Lookup map: fieldName → Map<recordId, displayLabel> for relation fields */
    relationLookups?: Record<string, Map<string, string>>;
}

// ─────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────

export function PeopleTable({
    people,
    activeTableId,
    activeTableSchema,
    activeSortConfig,
    onSortChange,
    isWidgetMode = false,
    onSelectRecord,
    onDeleteSuccess,
    onDeleteConfirm,
    relationLookups,
}: PeopleTableProps) {
    const { t } = useTranslation(['common', 'database']);
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    const [personToDelete, setPersonToDelete] = useState<PersonRecord | null>(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState<string | null>(null);

    const handleDeleteConfirm = useCallback(async () => {
        if (!personToDelete || !activeTableId) return;
        setIsDeleting(true);
        setDeleteError(null);
        try {
            if (onDeleteConfirm) await onDeleteConfirm(personToDelete);
            setPersonToDelete(null);
        } catch (err: unknown) {
            console.error('Failed to soft delete person:', err);
            const msg = err instanceof Error ? err.message : t('error_deleting_record', 'An error occurred while inactivating the record.');
            setDeleteError(msg);
        } finally {
            setIsDeleting(false);
        }
    }, [personToDelete, activeTableId, onDeleteConfirm, t]);

    // Campos do schema que não têm coluna estrutural → viram colunas dinâmicas automaticamente
    const dataColumns = useMemo(() => {
        if (!activeTableSchema) return [];
        return activeTableSchema.fields
            .filter(f => !STRUCTURAL.has(f.name))
            .map(f => ({
                id: f.name,
                label: t(`database:fields.${f.name}`, f.label ?? f.name),
                type: f.type,
                defaultVisible: true,
                defaultWidth: f.type === 'number' ? 130 : f.type === 'boolean' ? 80 : 150,
                minWidth: 30,
            }));
    }, [activeTableSchema, t]);

    const initialColumns = useMemo((): ColumnDefinition[] => {
        const cols: ColumnDefinition[] = [
            { id: 'name', label: t('database:fields.name', 'Name'), type: 'string', defaultVisible: true, defaultWidth: 300, minWidth: 30 },
        ];

        const fields = activeTableSchema?.fields ?? [];

        // Coluna "contact" — existe se o schema tiver campo de email OU telefone
        const hasContact = fields.some(f =>
            ['email', 'emailAddress', 'mail', 'e-mail', 'phone', 'telefone',
             'phoneNumber', 'mobile', 'celular', 'whatsapp'].includes(f.name)
        );
        if (hasContact) {
            cols.push({ id: 'contact', label: t('common:contact', 'Contact'), type: 'string', defaultVisible: true, defaultWidth: 220, minWidth: 30 });
        }

        // Coluna "role" — existe se o schema tiver campo de cargo/função
        const hasRole = fields.some(f =>
            ['role', 'cargo', 'position', 'funcao'].includes(f.name)
        );
        if (hasRole) {
            cols.push({ id: 'role', label: t('database:fields.role', 'Role / Position'), type: 'string', defaultVisible: true, defaultWidth: 160, minWidth: 30 });
        }

        // Colunas dinâmicas do schema (campos não-estruturais)
        cols.push(...dataColumns);

        cols.push({ id: 'status', label: t('database:fields.status', 'Status'), type: 'boolean', defaultVisible: true, defaultWidth: 100, minWidth: 30 });
        cols.push({ id: 'actions', label: t('actions', 'Actions'), type: 'actions', defaultVisible: !isWidgetMode, defaultWidth: 90, minWidth: 20 });

        return cols;
    }, [t, activeTableSchema, dataColumns, isWidgetMode]);

    const { columns, visibleCols, toggleColumn, isVisible, colWidths, tableWidth, onMouseDown, activeResizingColId, moveColumn, resetColumns } = useTableColumnControls(initialColumns, `lum-people-grid-${activeTableId}`);

    const numericColIds = useMemo(() => {
        if (!activeTableSchema) return new Set<string>();
        return new Set(activeTableSchema.fields.filter(f => f.type === 'number').map(f => f.name));
    }, [activeTableSchema]);

    const { isSortable, handleColSort, getColSortState } = useColumnSort(
        activeSortConfig ?? null,
        onSortChange ?? (() => {}),
        { colToField: COL_TO_FIELD }
    );

    const [portalRoot, setPortalRoot] = useState<HTMLElement | null>(null);
    useEffect(() => {
        setPortalRoot(document.getElementById('people-table-actions-portal'));
    }, []);

    return (
        <div className="flex flex-col gap-2 h-full">
            {/* Customize Columns Panel — portaled into the toolbar */}
            {!isWidgetMode && portalRoot && createPortal(
                <CustomizeColumnsPanel
                    columns={columns}
                    visibleCols={visibleCols}
                    onToggle={toggleColumn}
                    onMoveColumn={moveColumn}
                    onReset={resetColumns}
                    isOpen={isMenuOpen}
                    onOpenChange={setIsMenuOpen}
                    isWidgetMode={isWidgetMode}
                />,
                portalRoot
            )}

            <div className="bg-white dark:bg-neutral-900 border border-gray-200 dark:border-gray-800 rounded-xl shadow-sm flex-1 overflow-auto custom-scrollbar relative">
                <table className="divide-y divide-gray-200 dark:divide-gray-800 border-collapse table-fixed" style={{ width: `max(100%, ${tableWidth}px)` }}>
                    <colgroup>
                        {columns.map(col => {
                            if (!isVisible(col.id)) return null;
                            const width = colWidths[col.id];
                            return <col key={`col-${col.id}`} style={{ width, minWidth: width, maxWidth: width }} />;
                        })}
                        <col style={{ width: 'auto' }} />
                    </colgroup>
                    <thead className="bg-gray-100/50 dark:bg-neutral-800/50 sticky top-0 z-10 w-full shadow-sm">
                        <tr>
                            {columns.filter(col => isVisible(col.id)).map((col) => {
                                const isRight = numericColIds.has(col.id);
                                const isCenter = !isRight && (col.id === 'status' || col.id === 'actions');
                                const alignClass = isRight ? 'text-right' : isCenter ? 'text-center' : 'text-left';
                                const sortable = isSortable(col);
                                const sortState = getColSortState(col.id);

                                return (
                                    <th
                                        key={col.id}
                                        scope="col"
                                        onClick={sortable ? () => handleColSort(col.id) : undefined}
                                        className={`px-2 py-3 text-[11px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-wider border-b border-gray-200 dark:border-gray-800 select-none group relative z-20 hover:bg-gray-200/80 dark:hover:bg-neutral-700/50 transition-colors focus:outline-none ${sortable ? 'cursor-pointer' : ''} ${alignClass}`}
                                    >
                                        <div className="flex items-center gap-1 w-full" style={{ justifyContent: isRight ? 'flex-end' : isCenter ? 'center' : 'flex-start' }} title={col.label}>
                                            <span className="truncate">{col.label}</span>
                                            {sortable && (
                                                <span className={`shrink-0 transition-opacity ${sortState ? 'opacity-100 text-blue-500' : 'opacity-0 group-hover:opacity-40'}`}>
                                                    {sortState?.direction === 'desc'
                                                        ? <MdArrowDownward size={13} />
                                                        : sortState
                                                        ? <MdArrowUpward size={13} />
                                                        : <MdUnfoldMore size={13} />}
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
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-800 bg-white dark:bg-neutral-950 w-full block sm:table-row-group">
                        {people.map((person) => (
                            <PeopleRow
                                key={person.id}
                                person={person}
                                orderedCols={columns.filter(c => isVisible(c.id)).map(c => c.id)}
                                isWidgetMode={isWidgetMode}
                                tableId={activeTableId}
                                tableSchema={activeTableSchema}
                                onSelectRecord={onSelectRecord}
                                onDeleteClick={setPersonToDelete}
                                onEditSuccess={onDeleteSuccess}
                                relationLookups={relationLookups}
                            />
                        ))}
                    </tbody>
                </table>
            </div>

            <ConfirmDeleteModal
                isOpen={personToDelete !== null}
                onClose={() => {
                    setPersonToDelete(null);
                    setDeleteError(null);
                }}
                onConfirm={handleDeleteConfirm}
                isDeleting={isDeleting}
                error={deleteError}
                title={t('confirm_delete_person_title', 'Inactivate Person?')}
                message={t('confirm_delete_person_msg', 'This record will be inactivated and will no longer appear for new processes. Transaction history and relationships will be fully preserved.')}
            />
        </div>
    );
}
