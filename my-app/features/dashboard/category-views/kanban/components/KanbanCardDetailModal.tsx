'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'next-i18next';
import { MdClose, MdOutlineDescription, MdFormatListBulleted, MdOutlineLabel, MdOutlineAccessTime, MdDeleteOutline, MdOutlineContentCopy, MdOutlineRemoveRedEye, MdShare, MdArchive, MdOutlineDashboard, MdLabel } from 'react-icons/md';
import { Task } from '@/types/Task.types';
import { ITableSchema } from '@/features/dashboard/components/shared/dynamic-tables.client';
import { DynamicTableService } from '@/lib/services/dynamic-table.service';
import { useConfirmModal } from '@/components/ui/feedback/useConfirmModal';
import { isTableSchema, ISchemaField } from '@/features/dashboard/components/shared/dynamic-tables.client';
import { RelationLookups } from '../hooks/useRelationLookups';
import RelationSelector from '@/features/dashboard/components/forms/RelationSelector';
import InputField from '@/features/dashboard/components/forms/dynamic-form-fields/InputField';
import { MdCheck } from 'react-icons/md';

interface KanbanCardDetailModalProps {
    isOpen: boolean;
    onClose: () => void;
    task: Task | null;
    tableId: string;
    tableSchema: ITableSchema;
    onUpdate: () => void;
    columnTitle?: string;
    relationLookups?: RelationLookups;
}

export function KanbanCardDetailModal({
    isOpen,
    onClose,
    task,
    tableId,
    tableSchema,
    onUpdate,
    columnTitle,
    relationLookups
}: KanbanCardDetailModalProps) {
    const { t } = useTranslation(['common', 'database']);
    const { confirmNode, confirm } = useConfirmModal();

    const [isEditingTitle, setIsEditingTitle] = useState(false);
    const [titleValue, setTitleValue] = useState('');

    const [isEditingDescription, setIsEditingDescription] = useState(false);
    const [descriptionValue, setDescriptionValue] = useState('');

    const [isSaving, setIsSaving] = useState(false);
    const [editingFieldName, setEditingFieldName] = useState<string | null>(null);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    const titleInputRef = useRef<HTMLTextAreaElement>(null);
    const descriptionInputRef = useRef<HTMLTextAreaElement>(null);

    useEffect(() => {
        if (task) {
            setTitleValue(task.name || '');
            setDescriptionValue(task.description || '');
        }
    }, [task]);

    useEffect(() => {
        if (isEditingTitle && titleInputRef.current) {
            titleInputRef.current.focus();
            titleInputRef.current.select();
        }
    }, [isEditingTitle]);

    useEffect(() => {
        if (isEditingDescription && descriptionInputRef.current) {
            descriptionInputRef.current.focus();
        }
    }, [isEditingDescription]);

    const handleUpdateTask = useCallback(async (updates: Partial<Task>) => {
        if (!task) return;

        setIsSaving(true);
        try {
            await DynamicTableService.updateRecord(tableId, task.id, { data: { ...task, ...updates } });
            onUpdate();
        } catch (error) {
            console.error('Error updating task:', error);
            // Erro já notificado automaticamente pelo apiClient.
        } finally {
            setIsSaving(false);
        }
    }, [task, tableId, onUpdate]);

    const handleTitleBlur = () => {
        setIsEditingTitle(false);
        if (titleValue !== task?.name) {
            handleUpdateTask({ name: titleValue });
        }
    };

    const handleDescriptionSave = () => {
        setIsEditingDescription(false);
        if (descriptionValue !== task?.description) {
            handleUpdateTask({ description: descriptionValue });
        }
    };

    const handleDeleteTask = async () => {
        if (!task) return;

        await confirm({
            title: t('common:confirm_delete', 'Excluir registro?'),
            message: t('common:confirm_delete_message', 'Esta ação não pode ser desfeita.'),
            variant: 'danger',
            confirmLabel: t('common:delete', 'Excluir'),
            onConfirm: async () => {
                await DynamicTableService.deleteRecord(tableId, task.id);
                onUpdate();
                onClose();
            },
        });
    };

    const handleExtraFieldChange = (name: string, value: unknown) => {
        handleUpdateTask({ [name]: value });
        setEditingFieldName(null);
    };

    if (!mounted || !isOpen || !task) return null;

    const handledFields = ['name', 'description', 'status', 'id', 'order', 'createdAt', 'updatedAt', 'internalName', 'userId', 'dynamicTableId', 'priority'];
    const extraFields = tableSchema.fields.filter((f: ISchemaField) => !handledFields.includes(f.name) && !f.hidden);

    return createPortal(
        <div className="fixed inset-0 z-[110] flex items-start justify-center overflow-y-auto p-4 sm:p-6 md:p-12 lg:p-20">
            {/* Backdrop */}
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity" onClick={onClose} />

            {/* Modal Card */}
            <div className="relative w-full max-w-4xl bg-lumi-surface dark:bg-neutral-900 rounded-lg shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col min-h-[500px]">

                {/* Close Button */}
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 p-2 hover:bg-black/5 dark:hover:bg-white/5 rounded-full transition-colors z-20"
                >
                    <MdClose size={24} className="text-gray-500 dark:text-gray-400" />
                </button>

                <div className="p-6 md:p-8 flex flex-col gap-8">
                    {/* Header Section */}
                    <div className="flex gap-4 items-start pr-12">
                        <MdOutlineDashboard className="mt-1 text-gray-600 dark:text-gray-400" size={24} />
                        <div className="flex-1">
                            {isEditingTitle ? (
                                <textarea
                                    ref={titleInputRef}
                                    value={titleValue}
                                    onChange={(e) => setTitleValue(e.target.value)}
                                    onBlur={handleTitleBlur}
                                    className="w-full text-xl font-bold bg-white dark:bg-neutral-800 border-2 border-primary rounded px-2 py-1 outline-none resize-none overflow-hidden"
                                    rows={1}
                                />
                            ) : (
                                <h2
                                    onClick={() => setIsEditingTitle(true)}
                                    className="text-xl font-bold text-gray-800 dark:text-gray-100 cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 px-2 py-1 -ml-2 rounded transition-colors"
                                >
                                    {titleValue}
                                </h2>
                            )}
                            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                                Na lista <span className="underline font-medium">{columnTitle || task.status}</span>
                            </p>
                        </div>
                    </div>

                    {/* Body Section (2 Columns) */}
                    <div className="flex flex-col md:flex-row gap-8">

                        {/* Main Content Column */}
                        <div className="flex-1 flex flex-col gap-8">

                            {/* Metadata Badges (Trello style labels) */}
                            {Boolean(task.priority || task.category) && (
                                <div className="flex flex-wrap gap-4 pl-10">
                                    {task.priority && (
                                        <div className="flex flex-col gap-1.5">
                                            <span className="text-[11px] font-bold text-gray-500 dark:text-gray-400 tracking-tight uppercase">Prioridade</span>
                                            <div className={`px-3 py-1.5 rounded text-sm font-semibold flex items-center gap-2 ${task.priority === 'High' || task.priority === 'Urgent' ? 'bg-red-500 text-white' :
                                                task.priority === 'Medium' ? 'bg-amber-500 text-white' : 'bg-blue-500 text-white'
                                                }`}>
                                                <MdLabel size={16} />
                                                {task.priority}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Description Section */}
                            <div className="flex gap-4">
                                <MdOutlineDescription className="mt-1 text-gray-600 dark:text-gray-400" size={24} />
                                <div className="flex-1">
                                    <div className="flex items-center justify-between mb-2">
                                        <h3 className="font-bold text-gray-800 dark:text-gray-100 uppercase tracking-tight text-sm">Descrição</h3>
                                        {!isEditingDescription && descriptionValue && (
                                            <button
                                                onClick={() => setIsEditingDescription(true)}
                                                className="px-3 py-1 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-gray-600 dark:text-gray-400 rounded text-xs transition-colors"
                                            >
                                                Editar
                                            </button>
                                        )}
                                    </div>

                                    {isEditingDescription ? (
                                        <div className="flex flex-col gap-2">
                                            <textarea
                                                ref={descriptionInputRef}
                                                value={descriptionValue}
                                                onChange={(e) => setDescriptionValue(e.target.value)}
                                                placeholder="Adicione uma descrição mais detalhada..."
                                                className="w-full min-h-[150px] bg-white dark:bg-neutral-800 border-2 border-primary rounded p-3 outline-none resize-y text-sm"
                                            />
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={handleDescriptionSave}
                                                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded text-sm font-semibold transition-colors"
                                                >
                                                    Salvar
                                                </button>
                                                <button
                                                    onClick={() => setIsEditingDescription(false)}
                                                    className="px-4 py-2 hover:bg-black/5 dark:hover:bg-white/5 text-gray-600 dark:text-gray-400 rounded text-sm transition-colors"
                                                >
                                                    Cancelar
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div
                                            onClick={() => !descriptionValue && setIsEditingDescription(true)}
                                            className={`text-sm leading-relaxed p-2 -ml-2 rounded transition-colors ${descriptionValue
                                                ? 'text-gray-700 dark:text-gray-300'
                                                : 'bg-black/5 dark:bg-white/5 text-gray-500 hover:bg-black/10 dark:hover:bg-white/10 py-6 text-center italic cursor-pointer'
                                                }`}
                                        >
                                            {descriptionValue || 'Adicione uma descrição mais detalhada...'}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Dynamic Fields Section */}
                            {extraFields.length > 0 && (
                                <div className="flex gap-4">
                                    <MdFormatListBulleted className="mt-1 text-gray-600 dark:text-gray-400" size={24} />
                                    <div className="flex-1">
                                        <h3 className="font-bold text-gray-800 dark:text-gray-100 uppercase tracking-tight text-sm mb-4">Informações Detalhadas</h3>
                                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 bg-black/5 dark:bg-white/5 p-4 rounded-lg">
                                            {extraFields.map((field: ISchemaField) => {
                                                const value = task[field.name as keyof typeof task];
                                                const isEditing = editingFieldName === field.name;

                                                return (
                                                    <div key={field.name} className="flex flex-col gap-1 relative group/field">
                                                        <span className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest">{field.label || field.name}</span>
                                                        <div className="text-sm font-medium text-gray-800 dark:text-gray-100 flex items-center gap-2">
                                                            {isEditing ? (
                                                                <div className="flex items-center gap-1 w-full animate-in fade-in duration-200">
                                                                    <div className="flex-1">
                                                                        {field.type === 'relation' ? (
                                                                            <RelationSelector
                                                                                name={field.name}
                                                                                value={value as string | string[]}
                                                                                onChange={handleExtraFieldChange}
                                                                                targetTable={field.relation?.targetTable || ''}
                                                                                multiple={Boolean(field.relation?.allowMultiple)}
                                                                                className="!px-2 !py-1 !text-xs !bg-white dark:!bg-neutral-800 !rounded !border-primary"
                                                                            />
                                                                        ) : (
                                                                            <InputField
                                                                                type={field.type === 'date' ? 'date' : 'text'}
                                                                                name={field.name}
                                                                                value={value}
                                                                                onChange={(n, v) => handleUpdateTask({ [n]: v }).then(() => setEditingFieldName(null))}
                                                                                className="w-full text-xs bg-white dark:bg-neutral-800 border-2 border-primary rounded px-2 py-1 outline-none"
                                                                            />
                                                                        )}
                                                                    </div>
                                                                    <button
                                                                        onClick={() => setEditingFieldName(null)}
                                                                        className="p-1 hover:bg-black/5 dark:hover:bg-white/5 rounded transition-colors"
                                                                    >
                                                                        <MdClose size={16} className="text-gray-400" />
                                                                    </button>
                                                                </div>
                                                            ) : (
                                                                <div
                                                                    onClick={() => setEditingFieldName(field.name)}
                                                                    className="w-full cursor-pointer hover:bg-black/5 dark:hover:bg-white/5 px-2 py-1 -ml-2 rounded transition-colors flex items-center justify-between"
                                                                >
                                                                    {renderFieldValue(field, value, relationLookups)}
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>
                                </div>
                            )}

                        </div>

                        {/* Sidebar Column (Actions & Metadata) */}
                        <div className="w-full md:w-48 flex flex-col gap-6">

                            {/* Add to Card Section */}
                            <div className="flex flex-col gap-2">
                                <span className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest">Ações Rápidas</span>
                                <SidebarButton icon={MdArchive} label="Arquivar" />
                                <SidebarButton
                                    icon={MdDeleteOutline}
                                    label="Excluir"
                                    onClick={handleDeleteTask}
                                    className="hover:bg-red-500/10 hover:text-red-500 dark:hover:bg-red-500/20"
                                />
                            </div>

                            {/* Utility Section */}
                            <div className="flex flex-col gap-2">
                                <span className="text-[11px] font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest">Utilitários</span>
                                <SidebarButton icon={MdOutlineContentCopy} label="Copiar" />
                                <SidebarButton icon={MdShare} label="Compartilhar" />
                                <SidebarButton icon={MdOutlineRemoveRedEye} label="Seguir" />
                            </div>

                            {/* Metadata Info */}
                            <div className="mt-auto pt-6 border-t border-gray-200 dark:border-gray-800 flex flex-col gap-1.5 opacity-60">
                                <div className="flex items-center gap-2 text-[10px] text-gray-500 uppercase font-bold tracking-tight">
                                    <MdOutlineAccessTime size={14} />
                                    Criado em
                                </div>
                                <span className="text-xs text-gray-700 dark:text-gray-300">
                                    {task.createdAt ? new Date(task.createdAt).toLocaleDateString() : '—'}
                                </span>
                            </div>
                        </div>

                    </div>
                </div>

                {/* Global Spinner Overlay when Saving */}
                {isSaving && (
                    <div className="absolute inset-0 bg-white/50 dark:bg-black/50 z-50 flex items-center justify-center">
                        <div className="w-12 h-12 border-4 border-blue-600/30 border-t-blue-600 rounded-full animate-spin" />
                    </div>
                )}
                {confirmNode}
            </div>
        </div>,
        document.body
    );
}

interface SidebarButtonProps {
    icon: React.ComponentType<{ className?: string; size?: number }>;
    label: string;
    onClick?: () => void;
    className?: string;
}

function SidebarButton({ icon: Icon, label, onClick, className = '' }: SidebarButtonProps) {
    return (
        <button
            onClick={onClick}
            className={`flex items-center gap-3 px-3 py-2 bg-black/5 dark:bg-white/5 hover:bg-black/10 dark:hover:bg-white/10 text-gray-700 dark:text-gray-200 rounded transition-all text-sm font-medium text-left ${className}`}
        >
            <Icon size={18} />
            {label}
        </button>
    );
}

function renderFieldValue(field: ISchemaField, value: unknown, relationLookups?: RelationLookups) {
    if (value === null || value === undefined || value === '') return <span className="opacity-40 italic font-normal">Vazio</span>;

    if (field.type === 'relation') {
        const lookupMap = relationLookups?.[field.name];
        if (lookupMap) {
            const displayValue = lookupMap.get(String(value));
            return displayValue || String(value);
        }
        return String(value);
    }

    if (field.type === 'boolean') {
        return (
            <span className={`px-2 py-0.5 rounded-full text-[10px] uppercase font-bold ${value ? 'bg-green-500/10 text-green-600' : 'bg-red-500/10 text-red-600'}`}>
                {value ? 'Sim' : 'Não'}
            </span>
        );
    }

    if (field.type === 'date') {
        return new Date(value as string | number | Date).toLocaleDateString();
    }

    if (field.type === 'number' && (/price|valor|amount|salary/i.test(field.name))) {
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value as number);
    }

    return String(value);
}
