import React, { useMemo, useCallback } from 'react';
import { useTranslation } from 'next-i18next';
import { MdSort, MdArrowUpward } from 'react-icons/md';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface SortOption {
    field: string;
    direction: 'asc' | 'desc';
}

interface SortSelectProps {
    /** Current sort configuration */
    value: SortOption | null;
    /** Callback when sort changes */
    onChange: (sort: SortOption | null) => void;
    /** Records to infer sortable fields from */
    records: Array<{ id?: string; data?: Record<string, unknown> | object | null }>;
    /** Optional: Explicitly define allowed field names (overrides auto-detection) */
    allowedFields?: string[];
    /** Optional: Field display name mapping */
    fieldLabels?: Record<string, string>;
    /** Optional: Component layout variant */
    variant?: 'vertical' | 'horizontal';
}

// Default English labels for common fields (fallback when database:fields.* key is missing)
const DEFAULT_FIELD_LABELS: Record<string, string> = {
    name: 'Name',
    productName: 'Product Name',
    serviceName: 'Service Name',
    sku: 'SKU',
    category: 'Category',
    brand: 'Brand',
    price: 'Price',
    salePrice: 'Sale Price',
    costPrice: 'Cost Price',
    basePrice: 'Base Price',
    duration: 'Duration (min)',
    usageType: 'Usage Type',
    createdAt: 'Created At',
    updatedAt: 'Last Updated',
    stock: 'Stock',
    supplierName: 'Supplier',
    contactPerson: 'Contact Person',
};

// Fields that should be sortable (text/number types)
const SORTABLE_FIELD_TYPES = ['string', 'number'];

// Fields to exclude from sorting options
const EXCLUDED_FIELDS = ['id', 'unitId', 'productId', 'tenantDbId', 'createdAt', 'updatedAt', 'isActive', 'description', 'avatar', 'image', 'photo'];

// ─────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────

export function SortSelect({
    value,
    onChange,
    records,
    allowedFields,
    fieldLabels = {},
    variant = 'vertical'
}: SortSelectProps) {
    const { t } = useTranslation(['common', 'database']);

    // Dynamically detect sortable fields from records
    const sortableFields = useMemo(() => {
        if (allowedFields) {
            return allowedFields;
        }

        const fieldsSet = new Set<string>();

        // Sample first few records to detect field types
        const sampleRecords = records.slice(0, 10);
        sampleRecords.forEach(record => {
            if (record.data) {
                Object.entries(record.data).forEach(([key, val]) => {
                    if (
                        !EXCLUDED_FIELDS.includes(key) &&
                        SORTABLE_FIELD_TYPES.includes(typeof val) &&
                        val !== null &&
                        val !== undefined
                    ) {
                        fieldsSet.add(key);
                    }
                });
            }
        });

        return Array.from(fieldsSet).sort((a, b) => {
            // Prioritize common fields
            const priority = ['name', 'productName', 'serviceName', 'sku'];
            const aIdx = priority.indexOf(a);
            const bIdx = priority.indexOf(b);
            if (aIdx !== -1 && bIdx !== -1) return aIdx - bIdx;
            if (aIdx !== -1) return -1;
            if (bIdx !== -1) return 1;
            return a.localeCompare(b);
        });
    }, [records, allowedFields]);

    const handleFieldChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
        const field = e.target.value;
        if (!field) {
            onChange(null);
            return;
        }

        // Keep existing direction if possible, else default to 'asc'
        const direction = value?.direction || 'asc';
        onChange({ field, direction });
    }, [onChange, value]);

    const toggleDirection = useCallback(() => {
        if (!value) return;
        onChange({
            ...value,
            direction: value.direction === 'asc' ? 'desc' : 'asc'
        });
    }, [value, onChange]);

    if (sortableFields.length === 0) {
        return null; // No sortable fields detected
    }

    return (
        <div className={variant === 'horizontal' ? 'flex flex-col gap-1.5' : 'space-y-2'}>
            <label className="block text-[10px] font-black text-gray-400 dark:text-neutral-500 uppercase tracking-widest pl-1">
                {t('common:sort_by', 'Sort by')}
            </label>
            <div className={`flex gap-2 ${variant === 'horizontal' ? 'w-[200px]' : ''}`}>
                {/* Field Dropdown */}
                <div className="relative flex-1 group">
                    <select
                        value={value?.field || ''}
                        onChange={handleFieldChange}
                        className="w-full pl-3 pr-8 py-2 text-xs font-bold rounded-xl appearance-none bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 text-gray-700 dark:text-gray-300 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 dark:focus:border-blue-400/50 transition-all cursor-pointer shadow-sm"
                    >
                        <option value="">{t('common:default', 'Default')}</option>
                        {sortableFields.map(field => (
                            <option key={field} value={field}>
                                {fieldLabels[field] || t(`database:fields.${field}`, DEFAULT_FIELD_LABELS[field] || field)}
                            </option>
                        ))}
                    </select>
                    <div className="absolute inset-y-0 right-3 flex items-center pointer-events-none text-gray-400 group-hover:text-blue-500 transition-colors">
                        <MdSort size={14} />
                    </div>
                </div>

                {/* Direction Toggle */}
                <button
                    onClick={toggleDirection}
                    disabled={!value}
                    title={value?.direction === 'asc' ? t('common:ascending', 'Ascending') : t('common:descending', 'Descending')}
                    className={`
                        flex items-center justify-center w-9 h-9 rounded-xl border transition-all duration-200
                        ${!value
                            ? 'bg-gray-50 dark:bg-neutral-950 border-gray-100 dark:border-neutral-900 text-gray-300 dark:text-neutral-800 cursor-not-allowed'
                            : 'bg-white dark:bg-neutral-900 border-gray-200 dark:border-neutral-800 text-gray-600 dark:text-gray-400 hover:border-blue-500/50 hover:text-blue-500 active:scale-95 shadow-sm'
                        }
                    `}
                >
                    <MdArrowUpward
                        size={18}
                        className={`transition-transform duration-300 ${value?.direction === 'desc' ? 'rotate-180' : 'rotate-0'}`}
                    />
                </button>
            </div>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────
// Utility Function for Sorting Records
// ─────────────────────────────────────────────────────────────

/**
 * Sorts an array of records by a given field and direction
 * Works with any record type that has an optional data object.
 */
export function sortRecords<T extends { id: string; data?: object | null }>(
    records: T[],
    sort: SortOption | null,
    relationLookups?: Record<string, Map<string, string>>
): T[] {
    if (!sort) return records;

    return [...records].sort((a, b) => {
        const aData = a.data as Record<string, unknown> | undefined;
        const bData = b.data as Record<string, unknown> | undefined;
        let aVal = aData?.[sort.field];
        let bVal = bData?.[sort.field];

        const lookup = relationLookups?.[sort.field];
        if (lookup) {
            aVal = lookup.get(String(aVal ?? '')) ?? aVal;
            bVal = lookup.get(String(bVal ?? '')) ?? bVal;
        }

        // Handle undefined/null
        if (aVal == null && bVal == null) return 0;
        if (aVal == null) return sort.direction === 'asc' ? 1 : -1;
        if (bVal == null) return sort.direction === 'asc' ? -1 : 1;

        // Locale-aware comparison — uses browser locale, no implicit PT default.
        const locale = typeof navigator !== 'undefined' ? navigator.language : 'en-US';

        // String comparison
        if (typeof aVal === 'string' && typeof bVal === 'string') {
            const comparison = aVal.localeCompare(bVal, locale, { sensitivity: 'base' });
            return sort.direction === 'asc' ? comparison : -comparison;
        }

        // Number comparison
        if (typeof aVal === 'number' && typeof bVal === 'number') {
            return sort.direction === 'asc' ? aVal - bVal : bVal - aVal;
        }

        // Fallback: convert to string
        const aStr = String(aVal);
        const bStr = String(bVal);
        const comparison = aStr.localeCompare(bStr, locale, { sensitivity: 'base' });
        return sort.direction === 'asc' ? comparison : -comparison;
    });
}

