'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import type { SortOption } from '../../shared/SortSelect';
import { sortRecords } from '../../shared/SortSelect';
import { filterByQuery } from '../../../shared/utils/formatters';
import { getSearchableFields } from '../../shared/utils/sortUtils';
import type { IDynamicTableData } from '../../../components/shared/dynamic-tables.client';

const ITEMS_PER_PAGE = 25;

interface UsePlanningLogicProps {
    onTabChangeCallback?: (tabId: string) => void;
    records?: IDynamicTableData[];
    events?: { id: string; title: string; start?: string; end?: string; allDay?: boolean; backgroundColor?: string }[];
    relationLookups?: Record<string, Map<string, string>>;
    schema?: unknown;
}

export function usePlanningLogic({
    onTabChangeCallback,
    records = [],
    events = [],
    relationLookups,
    schema
}: UsePlanningLogicProps) {

    // --- State ---
    const [viewMode, setViewMode] = useState<'solid' | 'explorer'>(() => {
        if (typeof window === 'undefined') return 'solid';
        try {
            const saved = localStorage.getItem('lum-view-mode-planning');
            return (saved === 'solid' || saved === 'explorer') ? saved : 'solid';
        } catch (e) {
            return 'solid';
        }
    });

    const [query, setQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<string | null>(null);
    const [selectedRecord, setSelectedRecord] = useState<IDynamicTableData | null>(null);
    const [sortConfig, setSortConfig] = useState<SortOption | null>(null);
    const [currentPage, setCurrentPage] = useState(1);

    // Persist view mode changes
    useEffect(() => {
        try {
            localStorage.setItem('lum-view-mode-planning', viewMode);
        } catch (e) {
            console.error('Failed to persist planning view mode', e);
        }
    }, [viewMode]);

    // --- Filtered Data ---
    const filteredRecords = useMemo(() => {
        // Text search — respects the `searchable` flag via schema
        let result = filterByQuery(records, query, getSearchableFields(schema));

        if (statusFilter) {
            result = result.filter(r => {
                const d = r.data || {};
                return String(d.status || d.appointmentStatus || '').toLowerCase() === statusFilter.toLowerCase();
            });
        }

        return sortRecords(result, sortConfig, relationLookups);
    }, [records, query, statusFilter, sortConfig, relationLookups, schema]);

    const totalPages = Math.ceil(filteredRecords.length / ITEMS_PER_PAGE);
    const paginatedRecords = useMemo(() => {
        const start = (currentPage - 1) * ITEMS_PER_PAGE;
        return filteredRecords.slice(start, start + ITEMS_PER_PAGE);
    }, [filteredRecords, currentPage]);

    // Wrapped handlers — reset page inline, no useEffect watcher needed
    const handleQueryChange = useCallback((value: string) => {
        setQuery(value);
        setCurrentPage(1);
    }, []);

    const handleStatusFilterChange = useCallback((value: string | null) => {
        setStatusFilter(value);
        setCurrentPage(1);
    }, []);

    const handleSortChange = useCallback((value: SortOption | null) => {
        setSortConfig(value);
        setCurrentPage(1);
    }, []);

    // Derive filteredEvents from filteredRecords — reuses all filter/sort logic already applied
    const filteredEvents = useMemo(() => {
        const filteredIds = new Set(filteredRecords.map(r => String(r.id)));
        return events.filter(e => filteredIds.has(String(e.id)));
    }, [events, filteredRecords]);

    // --- Handlers ---
    const handleEventClick = useCallback((eventId: string, recordsList: IDynamicTableData[]) => {
        const rec = recordsList?.find(r => String(r.id) === String(eventId));
        if (rec) setSelectedRecord(rec);
    }, []);

    const handleTabChange = useCallback((id: string) => {
        if (onTabChangeCallback) onTabChangeCallback(id);
        setQuery('');
        setCurrentPage(1);
    }, [onTabChangeCallback]);

    return {
        // State
        viewMode,
        setViewMode,
        selectedRecord,
        setSelectedRecord,
        query,
        setQuery: handleQueryChange,
        statusFilter,
        setStatusFilter: handleStatusFilterChange,
        sortConfig,
        setSortConfig: handleSortChange,
        currentPage,
        setCurrentPage,

        // Filtered Data
        filteredRecords,
        paginatedRecords,
        filteredEvents,
        totalPages,
        itemsPerPage: ITEMS_PER_PAGE,

        // Handlers
        handleEventClick,
        handleTabChange
    };
}
