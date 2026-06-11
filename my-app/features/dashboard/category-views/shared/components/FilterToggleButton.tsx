'use client';

import React from 'react';
import { MdFilterList, MdFilterListOff } from 'react-icons/md';
import { useTranslation } from 'next-i18next';

interface FilterToggleButtonProps {
    isOpen: boolean;
    onToggle: () => void;
    activeFiltersCount?: number;
    className?: string;
}

export function FilterToggleButton({ isOpen, onToggle, activeFiltersCount = 0, className = '' }: FilterToggleButtonProps) {
    const { t } = useTranslation('common');

    return (
        <button
            onClick={onToggle}
            className={`
                relative flex items-center justify-center p-2 rounded-xl transition-all duration-200
                ${isOpen
                    ? 'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400'
                    : 'bg-white dark:bg-neutral-900 border border-gray-200 dark:border-neutral-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-neutral-800 shadow-sm'
                }
                ${className}
            `}
            title={isOpen ? t('filters.hide', 'Hide Filters') : t('filters.show', 'Show Filters')}
        >
            {isOpen ? <MdFilterListOff size={20} /> : <MdFilterList size={20} />}

            {/* Badge for active filters */}
            {!isOpen && activeFiltersCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-blue-600 text-[10px] font-bold text-white shadow-sm ring-2 ring-white dark:ring-neutral-900">
                    {activeFiltersCount}
                </span>
            )}
        </button>
    );
}

export default FilterToggleButton;
