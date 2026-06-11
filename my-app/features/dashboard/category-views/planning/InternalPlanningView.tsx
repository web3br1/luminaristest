'use client';

/**
 * InternalPlanningView.tsx
 * 
 * @description
 * Refactored Planning View following the Gold Standard.
 * Uses `usePlanningData` for data aggregation and `usePlanningLogic` for UI logic.
 * Standardized UX with CRM/ERP patterns:
 * - Tabbed navigation for multiple planning tables.
 * - ViewModeToggle (Calendar vs Explorer).
 * - i18n support.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'next-i18next';
import Link from 'next/link';

// Components
import type { IDynamicTable } from '../../components/shared/dynamic-tables.client';
import { isTableSchema } from '../../components/shared/dynamic-tables.client';
import FloatingActionButton from '../../components/shared/FloatingActionButton';
import { MdCalendarToday, MdEvent, MdGridView, MdTableChart } from 'react-icons/md';
import ViewModeToggle from '../shared/ViewModeToggle';
import GenericDataSidebar from '../../components/shared/GenericDataSidebar';
import CategoryHeader from '../shared/components/CategoryHeader';
import CategoryTabs from '../shared/components/CategoryTabs';
import { PlanningFilterBar } from './components/PlanningFilterBar';
import { PlanningCalendar } from './components/PlanningCalendar';
import { PlanningTable } from './components/PlanningTable';
import { EmptyState } from '../../shared/components/EmptyState';
import { ConfirmDeleteModal } from '../../shared/components/ConfirmDeleteModal';
import { StandardPagination } from '../../shared/components/StandardPagination';
import { useFilterPersistence } from '../shared/hooks/useFilterPersistence';

// Hooks
import { usePlanningData } from './hooks/usePlanningData';
import { usePlanningLogic } from './hooks/usePlanningLogic';

interface PlanningViewProps {
  tables: IDynamicTable[];
  isWidgetMode?: boolean;
}

export default function InternalPlanningView({ tables, isWidgetMode = false }: PlanningViewProps) {
  const { t } = useTranslation(['common', 'database']);

  // Initializer function avoids empty-string flash on first render
  const [activeTableId, setActiveTableId] = useState<string>(() => tables[0]?.id ?? '');

  useEffect(() => {
    if (!activeTableId && tables.length > 0) {
      setActiveTableId(tables[0].id);
    }
  }, [tables, activeTableId]);

  // --- Data Hook ---
  const {
    activeTable,
    tableData,
    records,
    isLoading,
    error,
    refetch,
    deleteRecord,
    eventCounts,
    events,
    relationLookups
  } = usePlanningData(tables, activeTableId);

  // Stable reference — prevents handleTabChange in logic hook from getting new ref on every render
  const handleTabIdChange = useCallback((id: string) => setActiveTableId(id), []);

  // --- Logic Hook ---
  const {
    viewMode,
    setViewMode,
    selectedRecord,
    setSelectedRecord,
    handleEventClick,
    handleTabChange,
    query,
    setQuery,
    statusFilter,
    setStatusFilter,
    sortConfig,
    setSortConfig,
    currentPage,
    setCurrentPage,
    filteredRecords,
    paginatedRecords,
    filteredEvents,
    totalPages,
    itemsPerPage
  } = usePlanningLogic({
    onTabChangeCallback: handleTabIdChange,
    records: records || [],
    events: events || [],
    relationLookups,
    schema: tableData?.schema
  });

  // --- Filter State ---
  const { isOpen: isFilterOpen, toggle: toggleFilter } = useFilterPersistence('planning', false);
  const activeFiltersCount = (query ? 1 : 0) + (statusFilter ? 1 : 0);

  const [recordToDelete, setRecordToDelete] = useState<{ id: string; data?: Record<string, unknown> } | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const handleDeleteClick = useCallback((record: { id: string; data?: Record<string, unknown> }) => {
      setRecordToDelete(record);
      setDeleteError(null);
  }, []);

  const handleDeleteConfirm = useCallback(async () => {
      if (!recordToDelete) return;
      setIsDeleting(true);
      setDeleteError(null);
      try {
          await deleteRecord(recordToDelete);
          setRecordToDelete(null);
      } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : t('common:error_deleting_record', 'Erro ao inativar registro.');
          setDeleteError(msg);
      } finally {
          setIsDeleting(false);
      }
  }, [deleteRecord, recordToDelete, t]);

  // Handlers extraídos — evitam inline arrows recriadas a cada render
  const handleCloseSidebar = useCallback(() => setSelectedRecord(null), [setSelectedRecord]);
  const handleCloseDeleteModal = useCallback(() => {
      setRecordToDelete(null);
      setDeleteError(null);
  }, []);
  const handleCalendarEventClick = useCallback(
      (id: string) => handleEventClick(id, filteredRecords),
      [handleEventClick, filteredRecords]
  );

  // --- Empty State ---
  if (tables.length === 0 && !isLoading) {
    return (
      <div className="flex h-full items-center justify-center p-8 bg-gray-50 dark:bg-neutral-900">
        <EmptyState
          icon={<MdCalendarToday size={64} />}
          title={t('common:planning_view.no_tables_found', 'Nenhuma Agenda Encontrada')}
          description={t('common:planning_view.no_tables_desc', 'Crie uma nova tabela de planejamento para começar a organizar seus eventos.')}
        />
      </div>
    );
  }

  return (
    <div className="flex h-full bg-gray-50 dark:bg-black overflow-hidden relative font-sans flex-col">
        {/* Header with Tabs */}
        {!isWidgetMode && (
          <CategoryHeader
            title={t('database:tables.planning', 'Planejamento')}
            icon={<MdCalendarToday size={20} />}
            iconBgClass="bg-blue-600 shadow-blue-500/20"
            isWidgetMode={isWidgetMode}
            portalId="planning-actions-portal"
            filterProps={{
              isOpen: isFilterOpen,
              onToggle: toggleFilter,
              activeCount: activeFiltersCount
            }}
          >
            <ViewModeToggle
              mode={viewMode}
              onChange={setViewMode}
              options={[
                { mode: 'solid', icon: <MdGridView size={18} /> },
                { mode: 'explorer', icon: <MdTableChart size={18} /> },
              ]}
            />
            {activeTable && tableData && isTableSchema(tableData.schema) && (
              <FloatingActionButton
                tableSchema={tableData.schema}
                onSuccess={refetch}
                tableId={activeTable.id}
                modalTitle={t('common:planning_view.new_event_in', { tableName: activeTable.name, defaultValue: `Novo evento em ${activeTable.name}` })}
              >
                {t('common:planning_view.new_event', 'Novo Evento')}
              </FloatingActionButton>
            )}
          </CategoryHeader>
        )}

        {/* Horizontal Filter Bar */}
        {!isWidgetMode && (
          <PlanningFilterBar
            isOpen={isFilterOpen}
            eventCounts={eventCounts}
            totalEvents={Array.isArray(records) ? records.length : 0}
            query={query}
            setQuery={setQuery}
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
            sortConfig={sortConfig}
            setSortConfig={setSortConfig}
            records={filteredRecords}
            schema={tableData?.schema}
          />
        )}

        <main className="flex-1 flex flex-col min-w-0 overflow-hidden bg-white dark:bg-neutral-950 transition-colors">

        {/* Tabs Navigation (Separated from Header) */}
        {!isWidgetMode && (
          <CategoryTabs
            tabs={tables.map(table => ({
              id: table.id,
              label: t(`database:tables.${table.internalName}`, table.name),
              icon: MdEvent,
              count: activeTableId === table.id ? (Array.isArray(records) ? records.length : 0) : 0
            }))}
            activeTabId={activeTableId}
            onTabChange={handleTabChange}
            colorTheme="blue"
          />
        )}

        {/* Content Area */}
        <div className="flex-1 min-h-0 relative flex flex-col bg-gray-50/20 dark:bg-neutral-950/20">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center h-64 space-y-3">
              <div className="w-8 h-8 border-2 border-blue-600/30 border-t-blue-600 rounded-full animate-spin" />
              <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                {t('common:planning_view.loading', 'Carregando agenda...')}
              </p>
            </div>
          ) : error ? (
            <div className="flex items-center justify-center h-64 text-red-500">{error}</div>
          ) : viewMode === 'explorer' ? (
            <div className="p-4 flex-1 flex flex-col min-h-0 overflow-hidden">
                <PlanningTable
                  tableData={tableData}
                  records={paginatedRecords}
                  onSelectRecord={setSelectedRecord}
                  onEditSuccess={refetch}
                  onDeleteClick={handleDeleteClick}
                  relationLookups={relationLookups}
                  isWidgetMode={isWidgetMode}
                  activeSortConfig={sortConfig}
                  onSortChange={setSortConfig}
                />
            </div>
          ) : (
            <div className="p-4 flex-1 overflow-y-auto custom-scrollbar">
              <PlanningCalendar
                events={filteredEvents}
                onEventClick={handleCalendarEventClick}
                records={filteredRecords}
                tableData={activeTable ?? null}
              />
            </div>
          )}
        </div>

        {viewMode === 'explorer' && filteredRecords.length > 0 && !isWidgetMode && (
            <StandardPagination
                currentPage={currentPage}
                totalPages={totalPages}
                totalItems={filteredRecords.length}
                itemsPerPage={itemsPerPage}
                onPageChange={setCurrentPage}
            />
        )}

        {isWidgetMode && (
          <div className="p-3 bg-white dark:bg-neutral-900 border-t border-gray-100 dark:border-gray-800 text-center shrink-0">
            <Link href="/dashboard?category=planning" className="text-sm font-semibold text-blue-600 dark:text-blue-400 hover:text-blue-700 hover:underline">
              {t('common:open_full_planning', 'Abrir Planejamento Completo')} &rarr;
            </Link>
          </div>
        )}

        {/* Sidebar Details */}
        <GenericDataSidebar
          isOpen={!!selectedRecord}
          onClose={handleCloseSidebar}
          table={activeTable ?? null}
          record={selectedRecord}
          onRefresh={refetch}
        />

        <ConfirmDeleteModal
            isOpen={recordToDelete !== null}
            onClose={handleCloseDeleteModal}
            onConfirm={handleDeleteConfirm}
            isDeleting={isDeleting}
            error={deleteError}
            title={t('common:confirm_delete_title', 'Inativar Registro?')}
            message={t('common:confirm_delete_msg', 'Este registro será inativado. O histórico será preservado.')}
        />
      </main>
    </div>
  );
}

