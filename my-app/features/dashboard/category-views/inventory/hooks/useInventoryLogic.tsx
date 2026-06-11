'use client';

import { useState, useMemo, useCallback } from 'react';
import { useTranslation } from 'next-i18next';
import { filterByQuery } from '../../../shared/utils/formatters';
import { getSearchableFields } from '../../shared/utils/sortUtils';
import type { SortOption } from '../../shared/SortSelect';
import { sortRecords } from '../../shared/SortSelect';
import { notify } from '../../../../../lib/notifications/notify';
import type { IDynamicTableData } from '../../../components/shared/dynamic-tables.client';

// ─────────────────────────────────────────────────────────────
// Module-level constants — stable references, never recreated on render
// ─────────────────────────────────────────────────────────────

const ITEMS_PER_PAGE = 25;
const LOCALE_MAP: Record<string, string> = { en: 'en-US', pt: 'pt-BR', de: 'de-DE' };

// ─────────────────────────────────────────────────────────────

interface UseInventoryLogicProps {
    products: IDynamicTableData[];
    inventoryLookup: Record<string, Record<string, IDynamicTableData>>;
    units: IDynamicTableData[];
    movements: IDynamicTableData[];
    onSaveInlinePrice: (invRecordId: string, newPrice: number) => Promise<void>;
    productsSchema?: unknown;
    movementsSchema?: unknown;
}

export function useInventoryLogic({
    products,
    inventoryLookup,
    units,
    movements,
    onSaveInlinePrice,
    productsSchema,
    movementsSchema,
}: UseInventoryLogicProps) {
    const { i18n } = useTranslation();
    const activeLocale = LOCALE_MAP[i18n.language] || 'en-US';

    // --- Filtering State ---
    const [query, setQuery]               = useState('');
    const [unitFilter, setUnitFilter]     = useState('');
    const [lowStockOnly, setLowStockOnly] = useState(false);
    const [sortConfig, setSortConfig]     = useState<SortOption | null>(null);

    // --- Modal State ---
    const [movementModal, setMovementModal] = useState<{ open: boolean; row: IDynamicTableData | null }>({ open: false, row: null });

    // --- Inline Edit State ---
    const [editingPriceId, setEditingPriceId]     = useState<string | null>(null);
    const [editingPriceValue, setEditingPriceValue] = useState<string>('');
    const [isSavingPrice, setIsSavingPrice]         = useState(false);

    // --- Stock Pagination State ---
    const [stockPage, setStockPage] = useState(1);

    // --- Movements Filter + Pagination State ---
    const [movementsQuery, setMovementsQuery]               = useState('');
    const [movementsTypeFilter, setMovementsTypeFilter]     = useState('');
    const [movementsPage, setMovementsPage]                 = useState(1);

    // --- Filter Logic ---
    const filteredProducts = useMemo(() => {
        let result = filterByQuery(products, query, getSearchableFields(productsSchema));

        if (lowStockOnly) {
            result = result.filter(prod => {
                const productUnits = inventoryLookup[prod.id] || {};
                return Object.values(productUnits).some(inv => {
                    const stock    = Number(inv.data.stock    || 0);
                    const reserved = Number(inv.data.reserved || 0);
                    return (stock - reserved) <= 5;
                });
            });
        }

        if (sortConfig) {
            result = sortRecords(result, sortConfig);
        } else {
            result.sort((a, b) => String(a.data.name || '').localeCompare(String(b.data.name || ''), activeLocale));
        }

        return result;
    }, [products, query, lowStockOnly, inventoryLookup, sortConfig, activeLocale, productsSchema]);

    // --- Stock Pagination ---
    const totalStockPages = Math.ceil(filteredProducts.length / ITEMS_PER_PAGE);
    const paginatedProducts = useMemo(() => {
        const start = (stockPage - 1) * ITEMS_PER_PAGE;
        return filteredProducts.slice(start, start + ITEMS_PER_PAGE);
    }, [filteredProducts, stockPage]);

    // --- Units ---
    const activeUnits = useMemo(() => {
        if (unitFilter) return units.filter(u => u.id === unitFilter);
        return units;
    }, [units, unitFilter]);

    const unitOptions = useMemo(() =>
        units.map(u => ({ id: u.id, name: String(u.data.name || 'Unidade') })),
    [units]);

    // --- Stats ---
    const stats = useMemo(() => {
        const totalSkus = products.length;
        let totalItems = 0;
        let criticalItems = 0;
        let totalValue = 0;

        Object.values(inventoryLookup).forEach(unitMap => {
            Object.values(unitMap).forEach(inv => {
                const stock     = Number(inv.data.stock     || 0);
                const reserved  = Number(inv.data.reserved  || 0);
                const salePrice = Number(inv.data.salePrice || 0);
                totalItems += stock;
                totalValue += stock * salePrice;
                if ((stock - reserved) <= 5) criticalItems++;
            });
        });

        return { totalSkus, totalItems, criticalItems, totalValue };
    }, [products, inventoryLookup]);

    // --- Movements Filter ---
    const filteredMovements = useMemo(() => {
        let result = filterByQuery(movements, movementsQuery, getSearchableFields(movementsSchema));
        if (movementsTypeFilter) {
            result = result.filter(m => (m.data.type || 'In') === movementsTypeFilter);
        }
        return result.sort((a, b) =>
            new Date(String(b.data.date || '')).getTime() - new Date(String(a.data.date || '')).getTime()
        );
    }, [movements, movementsQuery, movementsTypeFilter, movementsSchema]);

    // --- Movements Pagination ---
    const movementsTotalPages = Math.ceil(filteredMovements.length / ITEMS_PER_PAGE);
    const paginatedMovements = useMemo(() => {
        const start = (movementsPage - 1) * ITEMS_PER_PAGE;
        return filteredMovements.slice(start, start + ITEMS_PER_PAGE);
    }, [filteredMovements, movementsPage]);

    // --- Wrapped Handlers — reset pages inline, no useEffect watcher needed ---
    const handleQueryChange            = useCallback((v: string)            => { setQuery(v);              setStockPage(1);     }, []);
    const handleUnitFilterChange       = useCallback((v: string)            => { setUnitFilter(v);         setStockPage(1);     }, []);
    const handleLowStockChange         = useCallback((v: boolean)           => { setLowStockOnly(v);       setStockPage(1);     }, []);
    const handleSortChange             = useCallback((v: SortOption | null) => { setSortConfig(v);         setStockPage(1);     }, []);
    const handleMovementsQueryChange   = useCallback((v: string)            => { setMovementsQuery(v);     setMovementsPage(1); }, []);
    const handleMovementsTypeChange    = useCallback((v: string)            => { setMovementsTypeFilter(v); setMovementsPage(1); }, []);

    // --- Inline Price Save — delegates HTTP to data hook via callback ---
    const handleSaveInlinePrice = useCallback(async (invRecordId: string, newPrice: number) => {
        try {
            setIsSavingPrice(true);
            await onSaveInlinePrice(invRecordId, newPrice);
            setEditingPriceId(null);
            setEditingPriceValue('');
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Erro ao salvar preço.';
            notify(msg, 'error');
        } finally {
            setIsSavingPrice(false);
        }
    }, [onSaveInlinePrice]);

    return {
        // Filter state — exposed via wrapped handlers
        query,        setQuery:        handleQueryChange,
        unitFilter,   setUnitFilter:   handleUnitFilterChange,
        lowStockOnly, setLowStockOnly: handleLowStockChange,
        sortConfig,   setSortConfig:   handleSortChange,

        // Modal + inline edit state
        movementModal, setMovementModal,
        editingPriceId, setEditingPriceId,
        editingPriceValue, setEditingPriceValue,
        isSavingPrice,

        // Movements filter state
        movementsQuery, setMovementsQuery:           handleMovementsQueryChange,
        movementsTypeFilter, setMovementsTypeFilter: handleMovementsTypeChange,

        // Stock computed + pagination
        filteredProducts,
        paginatedProducts,
        stockPage, setStockPage,
        totalStockPages,

        // Movements computed + pagination
        filteredMovements,
        paginatedMovements,
        movementsPage, setMovementsPage,
        movementsTotalPages,

        // Other computed
        activeUnits,
        unitOptions,
        stats,

        // Actions
        handleSaveInlinePrice,

        // Constant (consumed by view for pagination display)
        ITEMS_PER_PAGE,
    };
}
