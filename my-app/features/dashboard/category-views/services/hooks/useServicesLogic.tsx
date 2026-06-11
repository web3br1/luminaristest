'use client';

import { useState, useMemo, useCallback } from 'react';
import { filterByQuery } from '../../../shared/utils/formatters';
import { getSearchableFields } from '../../shared/utils/sortUtils';
import type { SortOption } from '../../shared/SortSelect';
import { sortRecords } from '../../shared/SortSelect';
import type { ServiceRecord } from './useServicesData';

interface UseServicesLogicProps {
    services: ServiceRecord[];
    serviceRelationLookups?: Record<string, Map<string, string>>;
    serviceSchema?: unknown;
}

export function useServicesLogic({ services, serviceRelationLookups, serviceSchema }: UseServicesLogicProps) {
    // --- Filter State ---
    const [query, setQuery] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('');
    const [statusFilter, setStatusFilter] = useState('');
    const [sortConfig, setSortConfig] = useState<SortOption | null>(null);

    // --- View State ---
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 25;

    // --- Filter & Sort Logic ---
    const filteredRecords = useMemo(() => {
        let result = filterByQuery(services, query, getSearchableFields(serviceSchema));

        if (categoryFilter) {
            result = result.filter(r => String(r.data?.category) === categoryFilter);
        }

        if (statusFilter) {
            result = result.filter(r => {
                const isActive = r.data?.isActive !== false;
                return statusFilter === 'active' ? isActive : !isActive;
            });
        }

        // Apply sorting
        result = sortRecords(result, sortConfig, serviceRelationLookups);

        return result;
    }, [services, query, categoryFilter, statusFilter, sortConfig, serviceRelationLookups, serviceSchema]);

    // --- Pagination Logic ---
    const totalPages = Math.ceil(filteredRecords.length / itemsPerPage);
    const paginatedServices = useMemo(() => {
        const start = (currentPage - 1) * itemsPerPage;
        return filteredRecords.slice(start, start + itemsPerPage);
    }, [filteredRecords, currentPage, itemsPerPage]);

    // --- Handlers with inline page reset (no useEffect needed) ---
    const handleQueryChange = useCallback((val: string) => { setQuery(val); setCurrentPage(1); }, []);
    const handleCategoryChange = useCallback((val: string) => { setCategoryFilter(val); setCurrentPage(1); }, []);
    const handleStatusChange = useCallback((val: string) => { setStatusFilter(val); setCurrentPage(1); }, []);
    const handleSortChange = useCallback((sort: SortOption | null) => { setSortConfig(sort); setCurrentPage(1); }, []);

    // --- Stats ---
    const stats = useMemo(() => {
        const total = services.length;
        const active = services.filter((r) => r.data?.isActive !== false).length;
        return {
            total,
            active,
            inactive: total - active
        };
    }, [services]);

    return {
        // State
        query,
        setQuery: handleQueryChange,
        categoryFilter,
        setCategoryFilter: handleCategoryChange,
        statusFilter,
        setStatusFilter: handleStatusChange,
        sortConfig,
        setSortConfig: handleSortChange,
        currentPage,
        setCurrentPage,

        // Computed
        filteredRecords,
        paginatedServices,
        totalPages,
        itemsPerPage,
        stats
    };
}
