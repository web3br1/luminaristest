'use client';

import React, { useState, useCallback } from 'react';
import { MdBarChart, MdReceipt, MdAttachMoney, MdDashboard, MdMoreHoriz } from 'react-icons/md';
import type { IDynamicTable } from '../../components/shared/dynamic-tables.client';
import { isTableSchema } from '../../components/shared/dynamic-tables.client';
import { SalesView, AnalyticsView, ExpensesView } from './views';
import { EmptyState } from '../../shared/components/EmptyState';
import { useTranslation } from 'next-i18next';
import { useFinanceData } from './hooks/shared/useFinanceData';
import CategoryHeader from '../shared/components/CategoryHeader';
import CategoryTabs from '../shared/components/CategoryTabs';
import type { CategoryTabItem } from '../shared/components/CategoryTabs';
import FilterToggleButton from '../shared/components/FilterToggleButton';
import GenericTabbedView from '../shared/GenericTabbedView';
import { isNavigable } from '../shared/utils/presentationUtils';

import FloatingActionButton from '../../components/shared/FloatingActionButton';
import { useFilterPersistence } from '../shared/hooks/useFilterPersistence';
import Link from 'next/link';

interface FinanceViewProps {
  tables: IDynamicTable[];
  isWidgetMode?: boolean;
}

type FinanceTab = 'analytics' | 'sales' | 'expenses' | 'outros';

export default function FinanceView({ tables, isWidgetMode = false }: FinanceViewProps) {
  const { t } = useTranslation(['common', 'finance_view']);
  const [activeTab, setActiveTab] = useState<FinanceTab>('analytics');

  const { expensesTable, salesTable, saleItemsTable, hasTables } = useFinanceData(tables);

  // Compute "outros" tables: all navigable finance tables except the three covered tabs.
  // isNavigable() automatically excludes embedded (saleItems) and system tables.
  const outrasTables = tables.filter(t =>
    t.category === 'finance' &&
    isNavigable(t) &&
    t !== salesTable &&
    t !== expensesTable &&
    t !== saleItemsTable
  );

  // ALL hooks before any conditional return (Rules of Hooks)
  const [isSalesCreateOpen, setIsSalesCreateOpen] = useState(false);
  const [analyticsViewMode, setAnalyticsViewMode] = useState<'spreadsheets' | 'dashboard'>(
    isWidgetMode ? 'dashboard' : 'spreadsheets'
  );
  // SalesView gerencia seu próprio refetch via handleCreated — refreshKey é constante
  const salesRefreshKey = 0;
  const [expensesRefreshKey, setExpensesRefreshKey] = useState(0);
  const { isOpen: isSalesFilterOpen, toggle: toggleSalesFilter } = useFilterPersistence('finance-sales', false);
  const { isOpen: isExpensesFilterOpen, toggle: toggleExpensesFilter } = useFilterPersistence('finance-expenses', false);

  const tabs: CategoryTabItem[] = [
    { id: 'analytics', label: t('finance_view:tabs.analytics', 'Análises'), icon: MdBarChart },
    { id: 'sales', label: t('finance_view:tabs.sales', 'Vendas'), icon: MdAttachMoney },
    { id: 'expenses', label: t('finance_view:tabs.expenses', 'Despesas'), icon: MdReceipt },
    ...(outrasTables.length > 0
      ? [{ id: 'outros', label: t('finance_view:tabs.outros', 'Outros'), icon: MdMoreHoriz }]
      : []),
  ];

  const handleTabChange = useCallback((id: string) => {
    setActiveTab(id as FinanceTab);
  }, []);

  const handleSetSpreadsheets   = useCallback(() => setAnalyticsViewMode('spreadsheets'), []);
  const handleSetDashboard      = useCallback(() => setAnalyticsViewMode('dashboard'), []);
  const handleOpenSalesCreate   = useCallback(() => setIsSalesCreateOpen(true), []);
  const handleCloseSalesCreate  = useCallback(() => setIsSalesCreateOpen(false), []);
  const handleExpensesCreated   = useCallback(() => setExpensesRefreshKey(k => k + 1), []);

  // Guard after all hooks
  if (!hasTables && !isWidgetMode) {
    return (
      <div className="flex flex-col h-full bg-gray-50 dark:bg-black p-8 items-center justify-center">
        <EmptyState message={t('finance_view:no_tables', 'Nenhuma tabela financeira encontrada.')} />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-gray-50 dark:bg-black font-sans">
      {!isWidgetMode && (
        <CategoryHeader
          title={t('finance_view:title', 'Financeiro')}
          icon={<MdAttachMoney size={20} />}
          iconBgClass="bg-emerald-600 shadow-emerald-500/20"
          isWidgetMode={isWidgetMode}
          portalId="finance-actions-portal"
          bottomRow={
            <CategoryTabs
              tabs={tabs}
              activeTabId={activeTab}
              onTabChange={handleTabChange}
              colorTheme="blue"
            />
          }
        >
          <div className="flex items-center gap-2">
            {activeTab === 'analytics' && (
              <div className="flex items-center gap-2 p-1 bg-gray-50 dark:bg-neutral-800/50 rounded-xl">
                <button
                  onClick={handleSetSpreadsheets}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 flex items-center gap-2 ${analyticsViewMode === 'spreadsheets' ? 'bg-blue-600 text-white shadow-md' : 'bg-transparent text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'}`}
                >
                  <MdBarChart className="w-4 h-4" />
                  {t('finance_view:analytics.spreadsheets', 'Planilhas')}
                </button>
                <button
                  onClick={handleSetDashboard}
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 flex items-center gap-2 ${analyticsViewMode === 'dashboard' ? 'bg-blue-600 text-white shadow-md' : 'bg-transparent text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700'}`}
                >
                  <MdDashboard className="w-4 h-4" />
                  {t('finance_view:analytics.dashboard', 'Dashboard')}
                </button>
              </div>
            )}

            {activeTab === 'sales' && salesTable && (
              <div className="flex items-center gap-2">
                <FilterToggleButton
                  isOpen={isSalesFilterOpen}
                  onToggle={toggleSalesFilter}
                  activeFiltersCount={0}
                />
                <button
                  onClick={handleOpenSalesCreate}
                  className="px-4 py-1.5 rounded-xl bg-emerald-600 text-white hover:bg-emerald-700 transition-all font-bold text-sm shadow-sm"
                >
                  {t('finance_view:sales.new_sale', 'Nova Venda')}
                </button>
              </div>
            )}

            {activeTab === 'expenses' && expensesTable && (
              <div className="flex items-center gap-3">
                <FilterToggleButton
                  isOpen={isExpensesFilterOpen}
                  onToggle={toggleExpensesFilter}
                  activeFiltersCount={0}
                />
                {isTableSchema(expensesTable.schema) && (
                  <FloatingActionButton
                    tableId={expensesTable.id}
                    tableSchema={expensesTable.schema}
                    onSuccess={handleExpensesCreated}
                    modalTitle={t('finance_view:expenses.new_expense', 'Nova Despesa')}
                  >
                    <span className="text-sm font-bold">{t('finance_view:expenses.new_expense', 'Nova Despesa')}</span>
                  </FloatingActionButton>
                )}
              </div>
            )}
            
            {/* Portal target for Table Customization/Actions */}
            <div id="finance-actions-portal" className="flex items-center gap-2" />
          </div>
        </CategoryHeader>
      )}

      <div className="flex-1 min-h-0 relative flex flex-col overflow-hidden">
        {activeTab === 'analytics' && (
          <AnalyticsView tables={tables} isWidgetMode={isWidgetMode} viewModeOverride={analyticsViewMode} />
        )}
        {activeTab === 'sales' && (
          salesTable ? (
            <SalesView
              tables={tables}
              isWidgetMode={isWidgetMode}
              isFilterOpenOverride={isSalesFilterOpen}
              refreshKey={salesRefreshKey}
              isCreateOpen={isSalesCreateOpen}
              onCloseCreate={handleCloseSalesCreate}
            />
          ) : (
            <EmptyState message={t('finance_view:sales.not_found', 'Nenhuma tabela de vendas encontrada.')} />
          )
        )}
        {activeTab === 'expenses' && (
          expensesTable ? (
            <ExpensesView expensesTable={expensesTable} allTables={tables} isWidgetMode={isWidgetMode} isFilterOpenOverride={isExpensesFilterOpen} refreshKey={expensesRefreshKey} />
          ) : (
            <EmptyState message={t('finance_view:expenses.not_found', 'Nenhuma tabela de despesas encontrada.')} />
          )
        )}
        {activeTab === 'outros' && (
          <GenericTabbedView
            tables={outrasTables}
            title={t('finance_view:tabs.outros', 'Outros')}
            description={t('finance_view:outros.desc', 'Comissões, outras receitas e configurações financeiras.')}
          />
        )}
      </div>



      {isWidgetMode && (
        <div className="p-3 bg-white dark:bg-neutral-900 border-t border-gray-100 dark:border-gray-800 text-center shrink-0">
          <Link href="/dashboard?category=finance" className="text-sm font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 hover:underline">
            {t('finance_view:labels.open_full_finance', 'Abrir Financeiro Completo →')}
          </Link>
        </div>
      )}
    </div>
  );
}
