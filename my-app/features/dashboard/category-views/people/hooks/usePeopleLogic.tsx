'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import type { SortOption } from '../../shared/SortSelect';
import { sortRecords } from '../../shared/SortSelect';
import { filterByQuery } from '../../../shared/utils/formatters';
import { getSearchableFields } from '../../shared/utils/sortUtils';
import type { PersonRecord, PeopleStats } from './usePeopleData';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

interface UsePeopleLogicProps {
    people: PersonRecord[];
    /** Tabelas disponíveis — gerencia activeTabId internamente */
    peopleTables: { id: string }[];
    /** Ação de deleção centralizada no data hook */
    onDeletePerson?: (tableId: string, personId: string) => Promise<void>;
    /** Relation lookups por tableId — usados pelo sortRecords para resolver labels de relação */
    relationLookupsByTableId?: Record<string, Record<string, Map<string, string>>>;
    /** Schema por tableId — usado para respeitar a flag `searchable` na busca textual por aba */
    schemaByTableId?: Record<string, unknown>;
}

// ─────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────

/**
 * usePeopleLogic — gerencia todo estado de UI da view People.
 *
 * Consolida:
 * - Tab ativa (activeTabId) — antes vazava para a view
 * - Filtros, busca, sort, paginação
 * - Estado de deleção do card (grid mode) — antes vazava para a view
 */
export function usePeopleLogic({ people, peopleTables, onDeletePerson, relationLookupsByTableId, schemaByTableId }: UsePeopleLogicProps) {
    // ── Tab State ────────────────────────────────────────────
    // Initializer function avoids the empty-string flash on first render when
    // peopleTables is already available. The useEffect handles late arrivals
    // (when tables are fetched asynchronously after mount).
    const [activeTabId, setActiveTabId] = useState<string>(() => peopleTables[0]?.id ?? '');

    useEffect(() => {
        if (!activeTabId && peopleTables.length > 0) {
            setActiveTabId(peopleTables[0].id);
        }
    }, [peopleTables, activeTabId]);

    // ── UI State ─────────────────────────────────────────────
    const [query, setQueryState] = useState('');
    const [statusFilter, setStatusFilterState] = useState('');
    const [sortConfig, setSortConfigState] = useState<SortOption | null>(null);
    const [viewMode, setViewMode] = useState<'grid' | 'list'>(() => {
        if (typeof window === 'undefined') return 'grid';
        try {
            const saved = localStorage.getItem('lum-view-mode-people');
            return (saved === 'grid' || saved === 'list') ? saved : 'grid';
        } catch (e) {
            return 'grid';
        }
    });

    // Persist view mode changes
    useEffect(() => {
        try {
            localStorage.setItem('lum-view-mode-people', viewMode);
        } catch (e) {
            console.error('Failed to persist view mode', e);
        }
    }, [viewMode]);

    const [currentPage, setCurrentPage] = useState(1);
    const [selectedRecord, setSelectedRecord] = useState<PersonRecord | null>(null);

    // ── Card Delete State (movido da view) ───────────────────
    const [cardPersonToDelete, setCardPersonToDelete] = useState<PersonRecord | null>(null);
    const [isCardDeleting, setIsCardDeleting] = useState(false);
    const [cardDeleteError, setCardDeleteError] = useState<string | null>(null);

    // ── Handlers ─────────────────────────────────────────────

    const handleRecordClick = useCallback((record: PersonRecord | null) => {
        setSelectedRecord(record);
    }, []);

    const handleQueryChange = useCallback((value: string) => {
        setQueryState(value);
        setCurrentPage(1);
    }, []);

    const handleStatusFilterChange = useCallback((value: string) => {
        setStatusFilterState(value);
        setCurrentPage(1);
    }, []);

    const handleSortChange = useCallback((sort: SortOption | null) => {
        setSortConfigState(sort);
        setCurrentPage(1);
    }, []);

    const handleTabChange = useCallback((tabId: string) => {
        setActiveTabId(tabId);
        setCurrentPage(1);
        setQueryState('');
    }, []);

    /** Inicia o fluxo de deleção de um card (abre modal de confirmação) */
    const handleCardDeleteClick = useCallback((person: PersonRecord) => {
        setCardPersonToDelete(person);
    }, []);

    /** Confirma a deleção — delega HTTP ao data hook, gerencia estado de loading/erro */
    const confirmCardDelete = useCallback(async () => {
        if (!cardPersonToDelete || !activeTabId || !onDeletePerson) return;
        setIsCardDeleting(true);
        setCardDeleteError(null);
        try {
            await onDeletePerson(activeTabId, cardPersonToDelete.id);
            setCardPersonToDelete(null);
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Ocorreu um erro ao inativar o registro.';
            setCardDeleteError(msg);
        } finally {
            setIsCardDeleting(false);
        }
    }, [cardPersonToDelete, activeTabId, onDeletePerson]);

    /** Fecha o modal de confirmação e limpa o estado */
    const clearCardDelete = useCallback(() => {
        setCardPersonToDelete(null);
        setCardDeleteError(null);
    }, []);

    // ── Filter Logic ─────────────────────────────────────────
    const filteredPeople = useMemo(() => {
        // Filtra pela aba ativa (tableId)
        let result = people.filter(p => p.tableId === activeTabId);

        // Busca textual — respeita a flag `searchable` via schema da aba ativa
        if (query.trim()) {
            const searchableFields = getSearchableFields(schemaByTableId?.[activeTabId]);
            result = filterByQuery(result, query, searchableFields);
        }

        // Filtro de status
        if (statusFilter === 'active') {
            result = result.filter(p => p.isActive);
        } else if (statusFilter === 'inactive') {
            result = result.filter(p => !p.isActive);
        }

        // Pass relation lookups for the active tab so relation fields sort by display label
        const activeLookups = relationLookupsByTableId?.[activeTabId];
        return sortRecords(result, sortConfig, activeLookups);
    }, [people, activeTabId, query, statusFilter, sortConfig, relationLookupsByTableId, schemaByTableId]);

    // ── Tab Stats ────────────────────────────────────────────
    const tabStats = useMemo((): PeopleStats => {
        const tablePeople = people.filter(p => p.tableId === activeTabId);
        const active = tablePeople.filter(p => p.isActive).length;
        const byTable: Record<string, number> = {};
        people.forEach(p => {
            byTable[p.tableName] = (byTable[p.tableName] || 0) + 1;
        });
        return {
            total: tablePeople.length,
            active,
            inactive: tablePeople.length - active,
            byTable,
        };
    }, [people, activeTabId]);

    // ── Pagination ───────────────────────────────────────────
    const itemsPerPage = 25;
    const totalPages = Math.ceil(filteredPeople.length / itemsPerPage);
    const paginatedPeople = useMemo(() => {
        const start = (currentPage - 1) * itemsPerPage;
        return filteredPeople.slice(start, start + itemsPerPage);
    }, [filteredPeople, currentPage]);

    // ── Return ───────────────────────────────────────────────
    return {
        // Tab
        activeTabId,
        handleTabChange,

        // Filters & UI
        query,
        setQuery: handleQueryChange,
        statusFilter,
        setStatusFilter: handleStatusFilterChange,
        sortConfig: sortConfig,
        setSortConfig: handleSortChange,
        viewMode,
        setViewMode,
        currentPage,
        setCurrentPage,

        // Computed
        filteredPeople,
        paginatedPeople,
        tabStats,
        totalPages,
        itemsPerPage,

        // Record Selection
        selectedRecord,
        handleRecordClick,

        // Card Delete (encapsulado aqui, fora da view)
        cardPersonToDelete,
        handleCardDeleteClick,
        isCardDeleting,
        cardDeleteError,
        confirmCardDelete,
        clearCardDelete,
    };
}
