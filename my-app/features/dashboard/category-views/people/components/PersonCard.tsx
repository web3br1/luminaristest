'use client';

/**
 * PersonCard - Card CRM-style para exibição de pessoa
 *
 * No hover mostra menu de 3 pontos (⋮) com ações:
 * - Ver Detalhes → abre sidebar
 * - Editar → abre EditRecordButton modal
 * - Inativar → dispara onDeleteClick
 */

import React from 'react';
import { MdEmail, MdPhone, MdDelete } from 'react-icons/md';
import { useTranslation } from 'next-i18next';
import type { PersonRecord } from '../hooks/usePeopleData';
import EditRecordButton from '../../../components/shared/EditRecordButton';
import type { ITableSchema } from '../../../components/shared/dynamic-tables.client';
import { getInitials, getAvatarColor } from '../utils/people-display';

interface PersonCardProps {
    person: PersonRecord;
    onSelect?: () => void;
    tableId?: string;
    tableSchema?: ITableSchema;
    onDeleteClick?: (person: PersonRecord) => void;
    onEditSuccess?: () => void;
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function getTableColor(tableName: string): { bg: string; text: string } {
    const lower = tableName.toLowerCase();
    if (lower.includes('client') || lower.includes('customer')) {
        return { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-300' };
    }
    if (lower.includes('employee') || lower.includes('funcionario') || lower.includes('staff')) {
        return { bg: 'bg-purple-100 dark:bg-purple-900/30', text: 'text-purple-700 dark:text-purple-300' };
    }
    if (lower.includes('supplier') || lower.includes('fornecedor') || lower.includes('vendor')) {
        return { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-300' };
    }
    return { bg: 'bg-gray-100 dark:bg-gray-800', text: 'text-gray-700 dark:text-gray-300' };
}

// ─────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────

export function PersonCard({ person, onSelect, tableId, tableSchema, onDeleteClick, onEditSuccess }: PersonCardProps) {
    const { t } = useTranslation(['common', 'database']);
    const initials = getInitials(person.name);
    const avatarColor = getAvatarColor(person.name);
    const tableColor = getTableColor(person.tableName);

    return (
        <div
            role="button"
            tabIndex={0}
            className="group bg-white dark:bg-neutral-900 rounded-2xl border border-gray-200 dark:border-gray-800 p-4 hover:shadow-lg hover:border-gray-300 dark:hover:border-gray-700 transition-all duration-200 cursor-pointer"
            onClick={onSelect}
            onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && onSelect) { e.preventDefault(); onSelect(); } }}
            aria-label={person.name}
        >
            {/* Header with Avatar, Name and 3-dot menu */}
            <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3 min-w-0">
                    {/* Avatar */}
                    {person.avatarUrl ? (
                        <img
                            src={person.avatarUrl}
                            alt={person.name}
                            className="w-12 h-12 rounded-full object-cover ring-2 ring-white dark:ring-neutral-800 shrink-0"
                            onError={(e) => {
                                e.currentTarget.style.display = 'none';
                                const sibling = e.currentTarget.nextElementSibling as HTMLElement | null;
                                if (sibling) sibling.style.display = 'flex';
                            }}
                        />
                    ) : null}
                    <div
                        className={`w-12 h-12 rounded-full ${avatarColor} items-center justify-center text-white font-bold text-sm ring-2 ring-white dark:ring-neutral-800 shrink-0`}
                        style={{ display: person.avatarUrl ? 'none' : 'flex' }}
                    >
                        {initials}
                    </div>

                    {/* Name and Role */}
                    <div className="min-w-0">
                        <h3 className="font-semibold text-gray-900 dark:text-white truncate text-sm">
                            {person.name}
                        </h3>
                        {person.role && (
                            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                                {person.role}
                            </p>
                        )}
                    </div>
                </div>

                {/* Quick Actions (Visível apenas no hover do card) */}
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {tableId && tableSchema && (
                        <div onClick={(e) => e.stopPropagation()}>
                            <EditRecordButton
                                tableId={tableId}
                                tableSchema={tableSchema}
                                record={{ id: person.id, data: person.data }}
                                onSuccess={() => { if (onEditSuccess) onEditSuccess(); }}
                                className="!p-1.5 hover:bg-black/5 dark:hover:bg-white/10"
                                tableName={person.tableName}
                                tableInternalName={person.tableInternalName}
                            />
                        </div>
                    )}
                    {onDeleteClick && (
                        <button
                            onClick={(e) => { e.stopPropagation(); onDeleteClick(person); }}
                            className="p-1.5 rounded-full text-gray-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                            title={t('inactivate_record', 'Inativar')}
                        >
                            <MdDelete size={18} />
                        </button>
                    )}
                </div>
            </div>

            {/* Category Badge + Status */}
            <div className="flex items-center justify-between mb-3">
                <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-[10px] font-medium ${tableColor.bg} ${tableColor.text}`}>
                    {t(`database:tables.${person.tableInternalName}`, person.tableName)}
                </span>
                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${person.isActive
                    ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
                }`}>
                    {person.isActive ? t('database:options.Active', 'Ativo') : t('database:options.Inactive', 'Inativo')}
                </span>
            </div>

            {/* Contact Info */}
            <div className="space-y-1.5">
                {person.email && (
                    <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                        <MdEmail size={14} className="text-gray-400 flex-shrink-0" />
                        <span className="truncate">{person.email}</span>
                    </div>
                )}
                {person.phone && (
                    <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
                        <MdPhone size={14} className="text-gray-400 flex-shrink-0" />
                        <span className="truncate">{person.phone}</span>
                    </div>
                )}
                {!person.email && !person.phone && (
                    <div className="text-xs text-gray-400 dark:text-gray-500 italic">
                        {t('no_contact_info', 'Sem contato cadastrado')}
                    </div>
                )}
            </div>

        </div>
    );
}
