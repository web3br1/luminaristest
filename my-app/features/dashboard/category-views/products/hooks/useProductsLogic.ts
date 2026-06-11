'use client';

import { useState, useMemo, useCallback } from 'react';
import { filterByQuery } from '../../../shared/utils/formatters';
import { SortOption, sortRecords } from '../../shared/SortSelect';
import { getSearchableFields } from '../../shared/utils/sortUtils';
import type { DynamicRecord, ProductData } from './useProductsData';

interface UseProductsLogicProps {
    products: DynamicRecord<ProductData>[];
    productRelationLookups?: Record<string, Map<string, string>>;
    productSchema?: { schema?: unknown } | null;
}

export function useProductsLogic({ products, productRelationLookups, productSchema }: UseProductsLogicProps) {
    // --- Filter State ---
    const [query, setQuery] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('');
    const [brandFilter, setBrandFilter] = useState('');
    const [usageTypeFilter, setUsageTypeFilter] = useState('');
    const [sortConfig, setSortConfig] = useState<SortOption | null>(null);

    // --- View State ---
    const [currentPage, setCurrentPage] = useState(1);
    const itemsPerPage = 25;

    // --- Filter & Sort Logic ---
    const filteredProducts = useMemo(() => {
        const searchableFields = getSearchableFields(productSchema?.schema);
        let result = filterByQuery(products, query, searchableFields);

        if (categoryFilter) {
            result = result.filter(r => String(r.data?.category) === categoryFilter);
        }
        if (brandFilter) {
            result = result.filter(r => String(r.data?.brand) === brandFilter);
        }
        if (usageTypeFilter) {
            result = result.filter(r => String(r.data?.usageType) === usageTypeFilter);
        }

        // Apply sorting
        result = sortRecords(result, sortConfig, productRelationLookups);

        return result;
    }, [products, query, categoryFilter, brandFilter, usageTypeFilter, sortConfig, productRelationLookups, productSchema]);

    // --- Pagination Logic ---
    const totalPages = Math.ceil(filteredProducts.length / itemsPerPage);
    const paginatedProducts = useMemo(() => {
        const start = (currentPage - 1) * itemsPerPage;
        return filteredProducts.slice(start, start + itemsPerPage);
    }, [filteredProducts, currentPage, itemsPerPage]);

    // Reset to first page when filters change is now handled by callbacks
    const handleQueryChange = useCallback((val: string) => { setQuery(val); setCurrentPage(1); }, []);
    const handleCategoryChange = useCallback((val: string) => { setCategoryFilter(val); setCurrentPage(1); }, []);
    const handleBrandChange = useCallback((val: string) => { setBrandFilter(val); setCurrentPage(1); }, []);
    const handleUsageTypeChange = useCallback((val: string) => { setUsageTypeFilter(val); setCurrentPage(1); }, []);
    const handleSortChange = useCallback((sort: SortOption | null) => { setSortConfig(sort); setCurrentPage(1); }, []);

    // --- Stats ---
    const stats = useMemo(() => ({
        total: products.length,
        filtered: filteredProducts.length,
    }), [products, filteredProducts]);

    return {
        // State
        query,
        setQuery: handleQueryChange,
        categoryFilter,
        setCategoryFilter: handleCategoryChange,
        brandFilter,
        setBrandFilter: handleBrandChange,
        usageTypeFilter,
        setUsageTypeFilter: handleUsageTypeChange,
        sortConfig,
        setSortConfig: handleSortChange,
        currentPage,
        setCurrentPage,

        // Computed
        filteredProducts,
        paginatedProducts,
        totalPages,
        itemsPerPage,
        stats
    };
}
