'use client';

import React, { useEffect } from 'react';
import { useTranslation } from 'next-i18next';
import { HiChevronLeft, HiChevronRight } from 'react-icons/hi';

interface StandardPaginationProps {
    currentPage: number;
    totalPages: number;
    totalItems: number;
    itemsPerPage: number;
    onPageChange: (page: number) => void;
    className?: string;
    scrollToTop?: boolean;
}

/**
 * StandardPagination - A reusable pagination component for ERP/CRM views.
 * Features:
 * - Responsive layout.
 * - Dark mode compatible with high contrast.
 * - Current range display (e.g., "Showing 1-25 of 100").
 * - Automatic scroll to top on page change.
 */
export function StandardPagination({
    currentPage,
    totalPages,
    totalItems,
    itemsPerPage,
    onPageChange,
    className = '',
    scrollToTop = true,
}: StandardPaginationProps) {
    const { t } = useTranslation(['database', 'common']);

    // Scroll to top effect
    useEffect(() => {
        if (scrollToTop) {
            // Find the nearest scrollable parent or scroll window
            const scrollContainer = document.querySelector('.overflow-auto') ||
                document.querySelector('main') ||
                window;

            if (scrollContainer instanceof Element) {
                scrollContainer.scrollTo({ top: 0, behavior: 'smooth' });
            } else {
                window.scrollTo({ top: 0, behavior: 'smooth' });
            }
        }
    }, [currentPage, scrollToTop]);

    if (totalPages <= 1 && totalItems <= itemsPerPage) return null;

    const startItem = (currentPage - 1) * itemsPerPage + 1;
    const endItem = Math.min(currentPage * itemsPerPage, totalItems);

    return (
        <div className={`px-4 py-3 bg-white dark:bg-neutral-900 border-t border-gray-100 dark:border-gray-800 flex flex-col sm:flex-row items-center justify-between gap-4 ${className}`}>
            {/* Items Range Info */}
            <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
                {t('database:pagination.showing', {
                    start: startItem,
                    end: endItem,
                    total: totalItems,
                    defaultValue: `Showing ${startItem} - ${endItem} of ${totalItems} records`
                })}
            </p>

            {/* Navigation Controls */}
            <div className="flex items-center gap-1">
                <button
                    onClick={() => onPageChange(Math.max(1, currentPage - 1))}
                    disabled={currentPage === 1}
                    className="p-2 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                    title={t('database:pagination.prev', 'Previous')}
                >
                    <HiChevronLeft size={18} />
                </button>

                <div className="flex items-center gap-1 mx-2">
                    {/* Page numbers (Simplified for now, showing current/total) */}
                    <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 px-2 py-1 bg-gray-100 dark:bg-neutral-800 rounded-md">
                        {currentPage}
                    </span>
                    <span className="text-sm text-gray-400 dark:text-gray-500">/</span>
                    <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
                        {totalPages}
                    </span>
                </div>

                <button
                    onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
                    disabled={currentPage === totalPages}
                    className="p-2 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-neutral-800 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                    title={t('database:pagination.next', 'Next')}
                >
                    <HiChevronRight size={18} />
                </button>
            </div>
        </div>
    );
}

