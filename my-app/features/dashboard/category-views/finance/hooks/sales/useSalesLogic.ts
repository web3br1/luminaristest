'use client';

import { useState, useMemo, useCallback } from 'react';
import { useTranslation } from 'next-i18next';
import { SaleRecord } from '../../types/sales.types';
import { PeriodFilter } from '../../types/common.types';
import { isInPeriod } from '../../utils/periodFilters';
import { filterByQuery } from '../../../../shared/utils/formatters';
import { getSearchableFields } from '../../../shared/utils/sortUtils';

// ─────────────────────────────────────────────────────────────
// Module-level constants
// ─────────────────────────────────────────────────────────────

const ITEMS_PER_PAGE = 25;

/**
 * Hook para gerenciar a lógica de filtragem, pesquisa e paginação de vendas
 */
export function useSalesLogic(salesList: SaleRecord[], schema?: unknown) {
    const { t } = useTranslation(['common', 'finance_view']);

    // Memoized period labels — avoid object recreation on every render
    const periodLabels = useMemo<Record<PeriodFilter, string>>(() => ({
        all: t('common:periods.all', 'Todos'),
        this_month: t('common:periods.this_month', 'Este mês'),
        last_month: t('common:periods.last_month', 'Mês passado'),
        last_3_months: t('common:periods.last_3_months', 'Últimos 3 meses'),
        this_year: t('common:periods.this_year', 'Este ano'),
    }), [t]);

    // 1. Estados de filtro
    const [query, setQuery] = useState('');
    const [statusFilter, setStatusFilter] = useState<string>('all');
    const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('all');

    // 2. Paginação
    const [currentPage, setCurrentPage] = useState(1);

    // 3. Handlers
    const handleQueryChange = useCallback((val: string) => {
        setQuery(val);
        setCurrentPage(1);
    }, []);

    const handleStatusChange = useCallback((status: string) => {
        setStatusFilter(status);
        setCurrentPage(1);
    }, []);

    const handlePeriodChange = useCallback((period: PeriodFilter) => {
        setPeriodFilter(period);
        setCurrentPage(1);
    }, []);

    // 4. Filtragem
    const filteredSales = useMemo(() => {
        let result = [...salesList];

        // Filtro de texto — respeita a flag `searchable` via schema.
        // SaleRecord é achatado (sem `.data`); filterByQuery usa o fallback `r.data || r`,
        // então o cast é seguro em runtime — só satisfaz o constraint genérico do util.
        if (query.trim()) {
            const searchable = getSearchableFields(schema);
            result = filterByQuery(
                result as unknown as Array<{ data?: Record<string, unknown> }>,
                query,
                searchable
            ) as unknown as SaleRecord[];
        }

        // Filtro de status
        if (statusFilter !== 'all') {
            result = result.filter(sale => sale.status === statusFilter);
        }

        // Filtro de período
        if (periodFilter !== 'all') {
            result = result.filter(sale => isInPeriod(sale.date, periodFilter));
        }

        // Ordenar por data decrescente (mais recente primeiro)
        result.sort((a, b) => {
            const dateA = new Date(a.date || 0).getTime();
            const dateB = new Date(b.date || 0).getTime();
            return dateB - dateA;
        });

        return result;
    }, [salesList, query, statusFilter, periodFilter, schema]);

    // 5. Paginação final
    const totalPages = Math.ceil(filteredSales.length / ITEMS_PER_PAGE);
    const paginatedSales = useMemo(() => {
        const start = (currentPage - 1) * ITEMS_PER_PAGE;
        return filteredSales.slice(start, start + ITEMS_PER_PAGE);
    }, [filteredSales, currentPage]);

    // 6. Contagem de filtros ativos
    const activeFiltersCount = useMemo(() => {
        let count = 0;
        if (query.trim()) count++;
        if (statusFilter !== 'all') count++;
        if (periodFilter !== 'all') count++;
        return count;
    }, [query, statusFilter, periodFilter]);

    return {
        // Filtros
        query,
        setQuery: handleQueryChange,
        statusFilter,
        setStatusFilter: handleStatusChange,
        periodFilter,
        setPeriodFilter: handlePeriodChange,
        // Dados
        filteredSales,
        paginatedSales,
        totalPages,
        currentPage,
        setCurrentPage,
        activeFiltersCount,
        periodLabels,
        itemsPerPage: ITEMS_PER_PAGE,
    };
}
