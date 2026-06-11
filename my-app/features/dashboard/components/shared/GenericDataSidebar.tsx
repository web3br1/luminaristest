'use client';

import React, { useCallback } from 'react';
import { useTranslation } from 'next-i18next';
import { MdClose, MdInfoOutline, MdEvent, MdAttachMoney, MdLabelOutline } from 'react-icons/md';
import type { IDynamicTable, IDynamicTableData, ISchemaField } from './dynamic-tables.client';
import { isTableSchema } from './dynamic-tables.client';
import EditRecordButton from './EditRecordButton';
import { useRenderTypedValue } from '../../shared/hooks/useRenderTypedValue';
import { useTableRelationLookups } from '../../shared/hooks/useTableRelationLookups';

interface GenericDataSidebarProps {
    isOpen: boolean;
    onClose: () => void;
    table: IDynamicTable | null;
    record: IDynamicTableData | null;
    onRefresh?: () => void;
}

export default function GenericDataSidebar({ isOpen, onClose, table, record, onRefresh }: GenericDataSidebarProps) {
    const { t } = useTranslation(['common']);
    const renderTypedValue = useRenderTypedValue();

    // Resolve schema once with type guard — eliminates `as any` casts.
    const schema = table?.schema && isTableSchema(table.schema) ? table.schema : null;
    const fields: ISchemaField[] = schema?.fields ?? [];

    // Canonical relation lookup hook — replaces previous inline implementation.
    // Skips fetch automatically when sidebar is closed or table is null.
    const { relationLookups } = useTableRelationLookups(isOpen ? table : null);

    const handleSuccess = useCallback(() => { onRefresh?.(); onClose(); }, [onRefresh, onClose]);

    if (!isOpen) return null;

    function renderValue(f: ISchemaField) {
        const val = (record?.data ?? {})[f.name];

        // Boolean → badge verde/vermelho
        if (f.type === 'boolean') {
            return (
                <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                    val
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                        : 'bg-gray-100 text-gray-500 dark:bg-neutral-800 dark:text-gray-400'
                }`}>
                    {val ? t('yes', 'Yes') : t('no', 'No')}
                </span>
            );
        }

        // Relation → resolve via lookup map
        if (f.type === 'relation') {
            const map = relationLookups[f.name];
            const displayVal = Array.isArray(val)
                ? val.map(v => map?.get(String(v)) || String(v)).join(', ')
                : (map?.get(String(val)) || String(val));
            return <span className="text-gray-900 dark:text-gray-200 font-medium">{displayVal}</span>;
        }

        // JSON → key-value list (genérico para qualquer objeto)
        if (f.type === 'json') {
            let parsed: unknown = val;
            if (typeof val === 'string') {
                try { parsed = JSON.parse(val); } catch { /* mantém como string */ }
            }
            if (typeof parsed !== 'object' || parsed === null) {
                return <span className="font-mono text-xs text-gray-500 dark:text-gray-400">{String(val)}</span>;
            }
            return (
                <div className="space-y-1.5 mt-1">
                    {Object.entries(parsed as Record<string, unknown>).map(([key, v]) => (
                        <div key={key} className="flex gap-3 text-xs">
                            <span className="font-black text-gray-400 uppercase tracking-wider min-w-[90px] shrink-0 pt-0.5">
                                {key}
                            </span>
                            <span className="text-gray-700 dark:text-gray-300 font-mono break-all">
                                {typeof v === 'object' && v !== null
                                    ? Object.entries(v as Record<string, unknown>)
                                        .map(([k, vv]) => `${k}: ${vv}`)
                                        .join(' · ')
                                    : String(v)}
                            </span>
                        </div>
                    ))}
                </div>
            );
        }

        // Number, Date, Datetime, Enum → useRenderTypedValue (locale-aware)
        // Inclui type: 'number' com numberFormat: 'currency' | 'percentage' | 'integer' | 'decimal'
        const formatted = renderTypedValue(val, f.type, {
            numberFormat: f.numberFormat,
        });

        const isNumeric = f.type === 'number';
        const isCurrency = f.numberFormat === 'currency';

        return (
            <span className={
                isCurrency  ? 'font-black text-gray-900 dark:text-white tabular-nums'
                : isNumeric ? 'font-bold text-gray-700 dark:text-gray-300 tabular-nums'
                : 'text-gray-700 dark:text-gray-300 font-medium'
            }>
                {formatted}
            </span>
        );
    }

    function getIcon(f: ISchemaField) {
        if (f.type === 'number') {
            if (f.numberFormat === 'currency') return <MdAttachMoney className="text-emerald-500" size={16} />;
            return <MdInfoOutline className="text-gray-500" size={16} />;
        }
        if (f.type === 'date' || f.type === 'datetime') return <MdEvent className="text-blue-500" size={16} />;
        if (f.type === 'relation') return <MdLabelOutline className="text-indigo-500" size={16} />;
        if (f.type === 'json') return <MdInfoOutline className="text-amber-400" size={16} />;
        return <MdInfoOutline className="text-gray-400" size={16} />;
    }

    return (
        <div className="fixed inset-0 z-[60] flex justify-end">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/20 dark:bg-black/40 backdrop-blur-[2px] transition-opacity" onClick={onClose} />

            {/* Sidebar Content */}
            <div className="relative w-full max-w-md h-full bg-white dark:bg-neutral-900 shadow-2xl border-l border-gray-200 dark:border-gray-800 flex flex-col transform transition-transform duration-300 animate-slide-in-right">
                {/* Header */}
                <header className="p-6 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between bg-gray-50/50 dark:bg-neutral-800/30">
                    <div>
                        <h2 className="text-lg font-black text-gray-900 dark:text-white tracking-tight leading-tight">
                            {t('record_details', 'Record Details')}
                        </h2>
                        <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">
                            {table?.name || t('generic_table', 'Generic Table')}
                        </p>
                    </div>
                    <div className="flex items-center gap-2">
                        {table && record && schema && (
                            <EditRecordButton
                                tableId={table.id}
                                tableSchema={schema}
                                record={record}
                            onSuccess={handleSuccess}
                                className="bg-white dark:bg-neutral-800 shadow-sm border border-gray-200 dark:border-gray-700 p-2 text-blue-600 dark:text-blue-400"
                            />
                        )}
                        <button onClick={onClose} className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-neutral-800 text-gray-400 hover:text-gray-600 transition-colors">
                            <MdClose size={24} />
                        </button>
                    </div>
                </header>

                {/* Content */}
                <div className="flex-1 overflow-auto custom-scrollbar p-6">
                    <div className="space-y-1">
                        {fields
                            .filter((f) => !f.hidden)
                            .filter((f) => {
                                const val = (record?.data ?? {})[f.name];
                                return val != null && val !== '';
                            })
                            .map((f) => (
                                <div key={f.name} className="group p-3 rounded-xl hover:bg-gray-50 dark:hover:bg-neutral-800 transition-colors border border-transparent hover:border-gray-100 dark:hover:border-neutral-800">
                                    <div className="flex items-center gap-2 mb-1.5">
                                        {getIcon(f)}
                                        <span className="text-[11px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest">
                                            {f.label || f.name}
                                        </span>
                                    </div>
                                    <div className="pl-6 text-sm">
                                        {renderValue(f)}
                                    </div>
                                </div>
                            ))
                        }
                    </div>
                </div>
            </div>
        </div>
    );
}
