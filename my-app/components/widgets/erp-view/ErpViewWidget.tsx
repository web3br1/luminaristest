'use client';

import React, { useState, useEffect } from 'react';
import { HiOutlineTable, HiX, HiOutlineCog } from 'react-icons/hi';
import { useTranslation } from 'next-i18next';
import { useAuth } from '@/lib/context/AuthContext';
import { IDynamicTable } from '@/features/dashboard/components/shared/dynamic-tables.client';
import { DynamicTableService } from '@/lib/services/dynamic-table.service';

// View imports
import { PeopleView } from '@/features/dashboard/category-views/people/PeopleView';
import PlanningView from '@/features/dashboard/category-views/planning/PlanningView';
import InternalProductsView from '@/features/dashboard/category-views/products/InternalProductsView';
import ServicesView from '@/features/dashboard/category-views/services/ServicesView';
import InventoryView from '@/features/dashboard/category-views/inventory/InventoryView';
import FinanceView from '@/features/dashboard/category-views/finance/FinanceView';
import GenericTabbedView from '@/features/dashboard/category-views/shared/GenericTabbedView';

// --- Types ---

interface ErpWidgetConfig {
    categoryId?: string;
}

interface ErpViewWidgetProps {
    id: string;
    onClose?: () => void;
    initialConfig?: ErpWidgetConfig;
    onConfigChange?: (config: ErpWidgetConfig) => void;
}

// --- Constants ---

/** All ERP category modules available for selection in the widget. */
const ERP_CATEGORIES = [
    { id: 'commercial' },
    { id: 'people' },
    { id: 'planning' },
    { id: 'products' },
    { id: 'services' },
    { id: 'inventory' },
    { id: 'finance' },
    { id: 'operations' },
    { id: 'marketing' },
    { id: 'business' },
    { id: 'administrative' },
] as const;

// --- Component ---

export default function ErpViewWidget({ onClose, initialConfig, onConfigChange }: ErpViewWidgetProps) {
    const { t } = useTranslation(['common', 'database']);
    const { user } = useAuth();

    const [isConfiguring, setIsConfiguring] = useState(!initialConfig?.categoryId);
    const [config, setConfig] = useState<ErpWidgetConfig>(initialConfig || {});
    const [availableTables, setAvailableTables] = useState<IDynamicTable[]>([]);
    const [loadingTables, setLoadingTables] = useState(false);

    // Fetch available tables when user is authenticated
    useEffect(() => {
        async function fetchTables() {
            if (!user) return;
            try {
                setLoadingTables(true);
                const body = await DynamicTableService.getTables();
                if (Array.isArray(body?.data)) {
                    setAvailableTables(body.data as unknown as IDynamicTable[]);
                }
            } catch (err) {
                console.error('Failed to fetch tables for widget config', err);
            } finally {
                setLoadingTables(false);
            }
        }
        fetchTables();
    }, [user]);

    const handleSelectCategory = (categoryId: string) => {
        const newConfig: ErpWidgetConfig = { ...config, categoryId };
        setConfig(newConfig);
        setIsConfiguring(false);
        onConfigChange?.(newConfig);
    };

    const selectedCategoryName = config.categoryId
        ? (t(`database:categories.${config.categoryId}`, config.categoryId.toUpperCase()) as string)
        : t('common:erp_view_default_title', 'ERP View');

    const renderSelectedView = () => {
        if (!config.categoryId) return null;

        const categoryKey = config.categoryId.toLowerCase();
        const filtered = availableTables.filter(t => t.category === categoryKey);

        switch (categoryKey) {
            case 'people':
                return <PeopleView tables={availableTables} isWidgetMode={true} />;
            case 'planning': {
                const planningTables = availableTables.filter(table => table.category === 'planning');
                return <PlanningView tables={planningTables} isWidgetMode={true} />;
            }
            case 'products':
                return <InternalProductsView tables={availableTables} isWidgetMode={true} />;
            case 'services':
                return <ServicesView tables={filtered} isWidgetMode={true} />;
            case 'inventory':
                return <InventoryView tables={availableTables} isWidgetMode={true} />;
            case 'finance':
                return <FinanceView tables={availableTables} isWidgetMode={true} />;
            default:
                return (
                    <GenericTabbedView
                        tables={filtered}
                        title={t(`database:categories.${categoryKey}`, categoryKey.toUpperCase())}
                        description={t('common:manage_table_records', 'Gerencie os registros desta categoria.')}
                        isWidgetMode={true}
                    />
                );
        }
    };

    return (
        <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-sm flex flex-col h-full w-full overflow-hidden border border-gray-200 dark:border-gray-800">
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2.5 bg-gray-50/50 dark:bg-neutral-800/30 border-b border-gray-200 dark:border-gray-800 cursor-move drag-handle group">
                <div className="flex items-center gap-2 text-gray-700 dark:text-gray-300">
                    <HiOutlineTable className="w-4 h-4 text-indigo-500" />
                    <h3
                        className="font-semibold text-xs tracking-wide uppercase truncate max-w-[200px]"
                        title={selectedCategoryName}
                    >
                        {selectedCategoryName}
                    </h3>
                </div>

                {/* Actions — revealed on hover */}
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {!isConfiguring && (
                        <button
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => { e.stopPropagation(); setIsConfiguring(true); }}
                            className="widget-action-btn p-1 rounded text-gray-400 hover:text-black dark:hover:text-white hover:bg-gray-200 dark:hover:bg-neutral-700 transition-colors"
                            title={t('dashboard.widgets.common.settings', 'Configurações')}
                        >
                            <HiOutlineCog className="w-3.5 h-3.5" />
                        </button>
                    )}
                    {onClose && (
                        <button
                            onMouseDown={(e) => e.stopPropagation()}
                            onClick={(e) => { e.stopPropagation(); onClose(); }}
                            className="widget-action-btn p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                            title={t('dashboard.widgets.common.close', 'Fechar')}
                        >
                            <HiX className="w-3.5 h-3.5" />
                        </button>
                    )}
                </div>
            </div>

            {/* Content Body */}
            <div className="flex-grow overflow-hidden flex flex-col relative bg-transparent">
                {isConfiguring ? (
                    <div className="flex flex-col h-full p-4">
                        <label className="block mb-2 text-sm font-medium text-gray-900 dark:text-white">
                            {t('dashboard.widgets.erpView.selectCategory', 'Escolha o Módulo do ERP para exibir:')}
                        </label>
                        <div className="flex-grow overflow-y-auto custom-scrollbar mt-2 pr-2">
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                                {ERP_CATEGORIES.map(cat => {
                                    const label = t(`database:categories.${cat.id}`, cat.id.toUpperCase()) as string;
                                    const isActive = config.categoryId === cat.id;
                                    return (
                                        <button
                                            key={cat.id}
                                            onClick={() => handleSelectCategory(cat.id)}
                                            className={`p-3 text-left border rounded transition-all flex items-center justify-between group hover:shadow-sm
                                                ${isActive
                                                    ? 'border-gray-900 dark:border-white bg-gray-100 dark:bg-neutral-800 text-gray-900 dark:text-white ring-1 ring-gray-900 dark:ring-white'
                                                    : 'border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-neutral-800/50 text-gray-700 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'
                                                }`}
                                        >
                                            <span className="text-sm font-medium">{label}</span>
                                            {isActive && (
                                                <div className="w-2 h-2 rounded-full bg-gray-900 dark:bg-white" />
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    </div>
                ) : loadingTables ? (
                    <div className="flex-grow flex items-center justify-center">
                        <p className="text-gray-500 animate-pulse text-sm">
                            {t('loading_data', 'Carregando dados...')}
                        </p>
                    </div>
                ) : (
                    <div className="flex flex-col h-full w-full bg-gray-50 dark:bg-black rounded-b-lg overflow-hidden relative">
                        {renderSelectedView()}
                    </div>
                )}
            </div>
        </div>
    );
}
