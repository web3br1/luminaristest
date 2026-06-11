'use client';

import { useMemo, useState, useCallback } from 'react';
import { useTranslation } from 'next-i18next';
import type { IDynamicTable } from '../../../../components/shared/dynamic-tables.client';
import { isTableSchema } from '../../../../components/shared/dynamic-tables.client';
import type { PeriodFilter, DynamicRecord } from '../../types/common.types';
import type { SortOption } from '../../../shared/SortSelect';
import { sortRecords } from '../../../shared/SortSelect';
import { isInPeriod } from '../../utils/periodFilters';
import { filterByQuery } from '../../../../shared/utils/formatters';
import { getSearchableFields } from '../../../shared/utils/sortUtils';

// ─────────────────────────────────────────────────────────────
// Module-level constants
// ─────────────────────────────────────────────────────────────

const ITEMS_PER_PAGE = 25;

export function useExpensesLogic(
    table: IDynamicTable | null | undefined,
    records: DynamicRecord[] | null | undefined,
    relationLookups?: Record<string, Map<string, string>>
) {
    const { t } = useTranslation(['common', 'finance_view']);

    // Memoized period labels — avoid object recreation on every render
    const periodLabels = useMemo<Record<PeriodFilter, string>>(() => ({
        all: t('common:periods.all', 'Todos'),
        this_month: t('common:periods.this_month', 'Este mês'),
        last_month: t('common:periods.last_month', 'Mês passado'),
        last_3_months: t('common:periods.last_3_months', 'Últimos 3 meses'),
        this_year: t('common:periods.this_year', 'Este ano'),
    }), [t]);

    // Filters
    const [query, setQuery] = useState('');
    const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('all');
    const [categoryFilter, setCategoryFilter] = useState<string>('all');

    // Sort
    const [sortConfig, setSortConfig] = useState<SortOption | null>(null);

    // Pagination
    const [currentPage, setCurrentPage] = useState(1);

    // Schema analysis — single useMemo for all field-detection passes on [fields]
    const fields = useMemo(() => {
        if (!isTableSchema(table?.schema)) return [];
        return table!.schema.fields.filter(f =>
            ['string', 'number', 'integer', 'float', 'date', 'datetime', 'boolean', 'select', 'currency'].includes(f.type)
        );
    }, [table]);

    // Detect special fields in a single pass — one useMemo per [fields] change
    const { dateField, categoryField, amountField } = useMemo(() => ({
        dateField: fields.find(f =>
            f.type === 'date' || f.type === 'datetime' || f.name.toLowerCase().includes('date')
        )?.name,
        categoryField: fields.find(f =>
            f.type === 'select' || f.name.toLowerCase().includes('category')
        )?.name,
        amountField: fields.find(f =>
            f.name.toLowerCase().includes('amount') || f.name.toLowerCase().includes('valor')
        )?.name,
    }), [fields]);

    const categoryOptions = useMemo(() => {
        if (!categoryField) return [];
        const field = fields.find(f => f.name === categoryField);
        if (!field?.options) return [];
        return field.options.map(opt => typeof opt === 'string' ? opt : opt.value);
    }, [categoryField, fields]);

    // ── Handlers ─────────────────────────────────────────────
    // Each handler resets pagination inline — no useEffect watchers

    const handleQueryChange = useCallback((value: string) => {
        setQuery(value);
        setCurrentPage(1);
    }, []);

    const handlePeriodChange = useCallback((period: PeriodFilter) => {
        setPeriodFilter(period);
        setCurrentPage(1);
    }, []);

    const handleCategoryChange = useCallback((cat: string) => {
        setCategoryFilter(cat);
        setCurrentPage(1);
    }, []);

    /**
     * Sort handler — matches SortSelect.onChange signature (SortOption | null).
     * Resets pagination alongside sort change to keep the user on a valid page.
     */
    const handleSortChange = useCallback((sort: SortOption | null) => {
        setSortConfig(sort);
        setCurrentPage(1);
    }, []);

    // ── Filter → Sort → Paginate ─────────────────────────────

    const filteredRecords = useMemo(() => {
        let result = Array.isArray(records) ? [...records] : [];

        // Text search — respects the `searchable` flag via schema
        if (query.trim()) {
            const searchableFields = getSearchableFields(table?.schema);
            result = filterByQuery(result, query, searchableFields);
        }

        // Period filter
        if (periodFilter !== 'all' && dateField) {
            result = result.filter(r => isInPeriod(r.data[dateField], periodFilter));
        }

        // Category filter
        if (categoryFilter !== 'all' && categoryField) {
            result = result.filter(r => String(r.data[categoryField]) === categoryFilter);
        }

        // Sort via shared utility — respects relationLookups for label-aware ordering
        return sortRecords(result, sortConfig, relationLookups);
    }, [records, query, periodFilter, categoryFilter, dateField, categoryField, sortConfig, relationLookups]);

    // Pagination
    const totalPages = Math.ceil(filteredRecords.length / ITEMS_PER_PAGE);
    const paginatedRecords = useMemo(() => {
        const start = (currentPage - 1) * ITEMS_PER_PAGE;
        return filteredRecords.slice(start, start + ITEMS_PER_PAGE);
    }, [filteredRecords, currentPage]);

    // Stats
    const totalAmount = useMemo(() => {
        if (!amountField) return 0;
        return filteredRecords.reduce((sum, r) => {
            const val = Number(r.data[amountField] || 0);
            return sum + (isNaN(val) ? 0 : val);
        }, 0);
    }, [filteredRecords, amountField]);

    return {
        query,
        setQuery: handleQueryChange,
        periodFilter,
        setPeriodFilter: handlePeriodChange,
        categoryFilter,
        setCategoryFilter: handleCategoryChange,
        sortConfig,
        setSortConfig: handleSortChange, // ← wrapper: resets pagination on sort change
        currentPage,
        setCurrentPage,
        totalPages,
        categoryOptions,
        filteredRecords,
        paginatedRecords,
        totalAmount,
        periodLabels,
        itemsPerPage: ITEMS_PER_PAGE,
    };
}
