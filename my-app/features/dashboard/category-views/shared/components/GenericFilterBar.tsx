import React, { useCallback } from 'react';
import { useTranslation } from 'next-i18next';
import { FilterBar } from './FilterBar';
import { FilterGroup } from './FilterGroup';
import type { ITableSchema, ISchemaField } from '../../../components/shared/dynamic-tables.client';

interface GenericFilterBarProps {
    isOpen?: boolean;
    query: string;
    setQuery: (q: string) => void;
    recordCount: number;
    schema?: ITableSchema;
    fieldFilters: Record<string, string>;
    setFieldFilters: React.Dispatch<React.SetStateAction<Record<string, string>>>;
}

export function GenericFilterBar({
    isOpen = true,
    query,
    setQuery,
    recordCount,
    schema,
    fieldFilters,
    setFieldFilters,
}: GenericFilterBarProps) {
    const { t } = useTranslation(['common', 'database']);

    const handleFieldFilterChange = useCallback((fieldName: string, value: string) => {
        setFieldFilters(prev => {
            const next = { ...prev };
            if (value === '') {
                delete next[fieldName];
            } else {
                next[fieldName] = value;
            }
            return next;
        });
    }, [setFieldFilters]);

    return (
        <FilterBar isOpen={isOpen} className="border-b border-gray-100 dark:border-gray-800 flex-wrap overflow-x-auto custom-scrollbar">
            {/* Search */}
            <FilterGroup
                label={t('common:search_label', 'Search')}
                className="w-full md:w-80 shrink-0"
            >
                <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={t('common:search_placeholder', 'Search...')}
                    className="w-full px-3 py-2 text-sm rounded-lg bg-gray-50/50 dark:bg-neutral-800/50 border border-gray-200 dark:border-neutral-700 focus:outline-none focus:ring-2 focus:ring-purple-500/30 focus:border-purple-500 text-gray-900 dark:text-white placeholder:text-gray-400 transition-all font-medium"
                />
            </FilterGroup>

            {/* Dynamic Schema Filters */}
            {schema?.fields?.map((field: ISchemaField) => {
                if (field.type === 'enum' && field.options) {
                    return (
                        <FilterGroup key={field.name} label={String(t(`database:fields.${field.name}`, field.label || field.name))} className="w-full md:w-48 shrink-0">
                            <select
                                value={fieldFilters[field.name] || ''}
                                onChange={(e) => handleFieldFilterChange(field.name, e.target.value)}
                                className="w-full px-3 py-2 text-sm rounded-lg bg-gray-50/50 dark:bg-neutral-800/50 border border-gray-200 dark:border-neutral-700 focus:outline-none focus:ring-2 focus:ring-purple-500/30 focus:border-purple-500 text-gray-900 dark:text-white transition-all font-medium"
                            >
                                <option value="">{t('common:all', 'All')}</option>
                                {field.options.map((opt: string | { label: string; value: string }) => {
                                    const val = typeof opt === 'string' ? opt : opt.value;
                                    const lbl = typeof opt === 'string' ? opt : opt.label;
                                    return (
                                        <option key={val} value={val}>
                                            {String(t(`database:options.${val}`, lbl))}
                                        </option>
                                    );
                                })}
                            </select>
                        </FilterGroup>
                    );
                }

                if (field.type === 'boolean') {
                    return (
                        <FilterGroup key={field.name} label={String(t(`database:fields.${field.name}`, field.label || field.name))} className="w-full md:w-40 shrink-0">
                            <select
                                value={fieldFilters[field.name] || ''}
                                onChange={(e) => handleFieldFilterChange(field.name, e.target.value)}
                                className="w-full px-3 py-2 text-sm rounded-lg bg-gray-50/50 dark:bg-neutral-800/50 border border-gray-200 dark:border-neutral-700 focus:outline-none focus:ring-2 focus:ring-purple-500/30 focus:border-purple-500 text-gray-900 dark:text-white transition-all font-medium"
                            >
                                <option value="">{t('common:all', 'All')}</option>
                                <option value="true">{t('common:yes', 'Yes')}</option>
                                <option value="false">{t('common:no', 'No')}</option>
                            </select>
                        </FilterGroup>
                    );
                }

                return null;
            })}

            {/* Quick Stats */}
            <div className="ml-auto flex items-center gap-2 pl-4">
                <div className="bg-purple-50 dark:bg-purple-500/10 px-3 py-1.5 rounded-xl flex items-center gap-2">
                    <span className="text-sm font-black text-purple-600 dark:text-purple-400">{recordCount}</span>
                    <span className="text-[10px] font-bold text-purple-500/70 uppercase tracking-tight">{t('common:total', 'Total')}</span>
                </div>
            </div>
        </FilterBar>
    );
}
