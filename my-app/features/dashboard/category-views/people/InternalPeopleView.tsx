'use client';

/**
 * InternalPeopleView - Visualização consolidada de pessoas com estilo CRM
 * 
 * v3.0 - Navegação por abas (Tabbed Interface)
 * 
 * @description
 * Exibe pessoas separadas por abas (tabelas), permitindo foco em um grupo por vez.
 * Mantém funcionalidades de filtro, busca e visualização lateral.
 */

import React, { useMemo, useState, useCallback } from 'react';
import type { IDynamicTable } from '../../components/shared/dynamic-tables.client';
import { MdPeople, MdGridView, MdViewList, MdPerson, MdBusinessCenter, MdStorefront, MdGroup } from 'react-icons/md';
import Link from 'next/link';
// Local imports
import { PeopleFilterBar } from './components/PeopleFilterBar';
import { StandardPagination } from '../../shared/components/StandardPagination';
import { PersonCard } from './components/PersonCard';
import { PeopleTable } from './components/PeopleTable';
import { PeopleWizardModal } from './components/PeopleWizardModal';
import { ConfirmDeleteModal } from '../../shared/components/ConfirmDeleteModal';
import { usePeopleData, type PersonRecord } from './hooks/usePeopleData';
import { usePeopleLogic } from './hooks/usePeopleLogic';
import GenericDataSidebar from '../../components/shared/GenericDataSidebar';
import { useTranslation } from 'next-i18next';
import { EmptyState } from '../../shared/components/EmptyState';
import CategoryHeader from '../shared/components/CategoryHeader';
import CategoryTabs from '../shared/components/CategoryTabs';
import { useFilterPersistence } from '../shared/hooks/useFilterPersistence';
import ViewModeToggle from '../shared/ViewModeToggle';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface PeopleViewProps {
    tables: IDynamicTable[];
    isWidgetMode?: boolean;
}

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function getTableIcon(tableName: string) {
    const lower = tableName.toLowerCase();
    if (lower.includes('client') || lower.includes('customer')) return MdPerson;
    if (lower.includes('employee') || lower.includes('funcionario') || lower.includes('staff')) return MdBusinessCenter;
    if (lower.includes('supplier') || lower.includes('fornecedor')) return MdStorefront;
    return MdGroup;
}

// ─────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────

export default function InternalPeopleView({ tables, isWidgetMode = false }: PeopleViewProps) {
    const { t } = useTranslation(['common', 'database']);

    // --- Data Hook ---
    const {
        people,
        peopleTables,
        isLoading,
        refetch,
        schemaByTableId,
        deletePerson,
        createPerson,
        relationLookupsByTableId,
    } = usePeopleData(tables);

    // --- Logic Hook ---
    const {
        activeTabId,
        query, setQuery,
        statusFilter, setStatusFilter,
        sortConfig, setSortConfig,
        viewMode, setViewMode,
        currentPage, setCurrentPage,
        filteredPeople,
        paginatedPeople,
        tabStats,
        totalPages,
        itemsPerPage,
        selectedRecord,
        handleRecordClick,
        handleTabChange,
        cardPersonToDelete,
        handleCardDeleteClick,
        isCardDeleting,
        cardDeleteError,
        confirmCardDelete,
        clearCardDelete,
    } = usePeopleLogic({
        people,
        peopleTables,
        onDeletePerson: deletePerson,
        relationLookupsByTableId,
        schemaByTableId,
    });

    // --- Filter State ---
    const { isOpen: isFilterOpen, toggle: toggleFilter } = useFilterPersistence('people', false);
    const activeFiltersCount = useMemo(() => {
        let count = 0;
        if (query) count++;
        if (statusFilter && statusFilter !== '') count++;
        return count;
    }, [query, statusFilter]);

    // --- Wizard State ---
    const [isWizardOpen, setIsWizardOpen] = useState(false);

    // --- Wizard Handlers ---
    // refetch() is already called internally by createPerson — no second call needed here
    const handleWizardSuccess = useCallback(() => {
        setIsWizardOpen(false);
    }, []);

    const handleWizardSubmit = useCallback(async (data: Record<string, unknown>) => {
        await createPerson(activeTabId, data);
    }, [createPerson, activeTabId]);

    // --- Table Delete Adapter (adapts PersonRecord signature → (tableId, personId)) ---
    const deletePersonFromTable = useCallback(
        (person: import('./hooks/usePeopleData').PersonRecord) => deletePerson(activeTabId, person.id),
        [deletePerson, activeTabId]
    );

    // --- Active Schema for FAB ---
    const activeSchema = schemaByTableId[activeTabId];


    // --- Empty State ---
    if (peopleTables.length === 0 && !isLoading) {
        return (
            <div className="p-8 h-full flex flex-col items-center justify-center bg-gray-50 dark:bg-neutral-900">
                <EmptyState
                    icon={<MdPeople size={64} />}
                    title={t('no_people_tables_found', 'Nenhuma tabela de pessoas encontrada')}
                    description={t('no_people_tables_desc', 'Certifique-se de que possui tabelas com a categoria "people" instaladas.')}
                />
            </div>
        );
    }

    // --- Render ---
    return (
        <div className="flex h-full bg-gray-50 dark:bg-black overflow-hidden relative font-sans flex-col">
            {/* Header */}
            <CategoryHeader
                title={t('database:tables.people', 'Pessoas')}
                icon={<MdPeople size={20} />}
                iconBgClass="bg-blue-600 shadow-blue-500/20"
                isWidgetMode={isWidgetMode}
                portalId="people-table-actions-portal"
                filterProps={{
                    isOpen: isFilterOpen,
                    onToggle: toggleFilter,
                    activeCount: activeFiltersCount
                }}
            >
                <div className="mr-2">
                    <ViewModeToggle
                        mode={viewMode}
                        onChange={setViewMode}
                        options={[
                            { mode: 'grid', icon: <MdGridView size={18} /> },
                            { mode: 'list', icon: <MdViewList size={18} /> },
                        ]}
                    />
                </div>
                {activeTabId && activeSchema && (
                    <button
                        onClick={() => setIsWizardOpen(true)}
                        className="flex items-center gap-2 px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl shadow-lg shadow-blue-500/20 active:scale-95 transition-all font-bold text-sm"
                    >
                        <MdPeople size={20} />
                        {t('common:new_record', 'Novo Registro')}
                    </button>
                )}
            </CategoryHeader>

            {/* Horizontal Filter Bar */}
            {!isWidgetMode && (
                <PeopleFilterBar
                    isOpen={isFilterOpen}
                    query={query}
                    setQuery={setQuery}
                    statusFilter={statusFilter}
                    setStatusFilter={setStatusFilter}
                    sortConfig={sortConfig}
                    setSortConfig={setSortConfig}
                    people={filteredPeople || []}
                    stats={tabStats}
                />
            )}

            {/* Main Content */}
            <main className="flex-1 flex flex-col min-w-0 overflow-hidden bg-white dark:bg-neutral-950 transition-colors">
                {/* Tabs Header */}
                <CategoryTabs
                    tabs={peopleTables.map(table => ({
                        id: table.id,
                        label: t(`database:tables.${table.name.toLowerCase().replace(/\s+/g, '_')}`, table.name),
                        icon: getTableIcon(table.name),
                        count: tabStats.byTable[table.name] || 0
                    }))}
                    activeTabId={activeTabId}
                    onTabChange={handleTabChange}
                    colorTheme="blue"
                />

                {/* Content Area */}
                <div className="flex-1 min-h-0 relative flex flex-col">
                    {isLoading ? (
                        <div className="flex items-center justify-center h-64">
                            <div className="flex flex-col items-center gap-3">
                                <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
                                <p className="text-sm font-medium text-gray-500 animate-pulse">{t('common:loading', 'Carregando...')}</p>
                            </div>
                        </div>
                    ) : paginatedPeople.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full min-h-[400px]">
                            <EmptyState
                                icon={<MdPerson size={64} />}
                                title={t('no_results', 'Nenhum resultado')}
                                description={t('no_results_desc', 'Tente ajustar seus filtros ou busca.')}
                                action={(query || statusFilter) && (
                                    <button
                                        onClick={() => { setQuery(''); setStatusFilter(''); }}
                                        className="text-blue-600 font-semibold text-sm hover:underline"
                                    >
                                        {t('clear_filters', 'Limpar filtros')}
                                    </button>
                                )}
                            />
                        </div>
                    ) : (
                        <div className={viewMode === 'grid' ? 'p-4 flex-1 overflow-y-auto custom-scrollbar' : 'p-3 flex-1 flex flex-col min-h-0'}>
                            {viewMode === 'grid' ? (
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
                                    {(isWidgetMode ? paginatedPeople.slice(0, 5) : paginatedPeople).map(person => (
                                        <PersonCard
                                            key={person.id}
                                            person={person}
                                            onSelect={() => handleRecordClick(person)}
                                            tableId={activeTabId}
                                            tableSchema={activeSchema}
                                            onDeleteClick={handleCardDeleteClick}
                                            onEditSuccess={refetch}
                                        />
                                    ))}
                                </div>
                            ) : (
                                <PeopleTable
                                    key={activeTabId}
                                    people={isWidgetMode ? paginatedPeople.slice(0, 5) : paginatedPeople}
                                    activeTableId={activeTabId}
                                    activeTableSchema={activeSchema}
                                    activeSortConfig={sortConfig}
                                    onSortChange={setSortConfig}
                                    isWidgetMode={isWidgetMode}
                                    onSelectRecord={handleRecordClick}
                                    onDeleteConfirm={deletePersonFromTable}
                                    relationLookups={relationLookupsByTableId[activeTabId]}
                                />
                            )}
                        </div>
                    )}
                </div>

                {!isWidgetMode ? (
                    <StandardPagination
                        currentPage={currentPage}
                        totalPages={totalPages}
                        totalItems={filteredPeople.length}
                        itemsPerPage={itemsPerPage}
                        onPageChange={setCurrentPage}
                    />
                ) : (
                    <div className="p-3 bg-white dark:bg-neutral-900 border-t border-gray-100 dark:border-gray-800 text-center">
                        <Link href="/dashboard?category=people" className="text-sm font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 hover:underline">
                            {t('common:view_all', 'Ver todos')} ({filteredPeople.length}) →
                        </Link>
                    </div>
                )}
            </main>

            {/* Wizard Modal */}
            <PeopleWizardModal
                isOpen={isWizardOpen}
                onClose={() => setIsWizardOpen(false)}
                onSuccess={handleWizardSuccess}
                onSubmit={handleWizardSubmit}
                tableId={activeTabId}
                schema={activeSchema}
                modalTitle={t('common:new_record', 'Novo Registro')}
            />

            {/* Sidebar Details */}
            <GenericDataSidebar
                isOpen={!!selectedRecord}
                onClose={() => handleRecordClick(null)}
                table={tables.find(t => t.id === selectedRecord?.tableId) || null}
                record={selectedRecord ? { id: selectedRecord.id, data: selectedRecord.data } : null}
                onRefresh={refetch}
            />

            {/* Card Grid Delete Confirmation */}
            <ConfirmDeleteModal
                isOpen={cardPersonToDelete !== null}
                onClose={clearCardDelete}
                onConfirm={confirmCardDelete}
                isDeleting={isCardDeleting}
                error={cardDeleteError}
                title={t('confirm_delete_person_title', 'Inativar Pessoa?')}
                message={t('confirm_delete_person_msg', 'Este registro será inativado e deixará de aparecer para novos processos. O histórico de transações e relacionamentos, no entanto, será preservado íntegro.')}
            />
        </div>
    );
}
