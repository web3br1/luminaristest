'use client';

import React from 'react';
import { useTranslation } from 'next-i18next';
import FilterToggleButton from './FilterToggleButton';

interface CategoryHeaderProps {
    title: string;
    icon?: React.ReactNode;
    iconBgClass?: string;
    isWidgetMode?: boolean;
    onBack?: () => void;
    portalId?: string;
    filterProps?: {
        isOpen: boolean;
        onToggle: () => void;
        activeCount: number;
    };
    children?: React.ReactNode; // Extra elements like Grid/List toggle or FAB
    bottomRow?: React.ReactNode; // For tabs or other bottom elements
}

export function CategoryHeader({
    title,
    icon,
    iconBgClass = 'bg-blue-600 shadow-blue-500/20',
    isWidgetMode = false,
    onBack,
    portalId,
    filterProps,
    children,
    bottomRow
}: CategoryHeaderProps) {
    const { t } = useTranslation(['common']);

    if (isWidgetMode) return null;

    return (
        <header className="px-4 pt-3 pb-3 border-b border-gray-100 dark:border-gray-800 bg-white dark:bg-neutral-900 sticky top-0 z-40 min-h-[64px]">
            <div className="flex items-center justify-between w-full">
                <div className="flex items-center gap-4 lg:gap-6">
                    {onBack && (
                        <button
                            onClick={onBack}
                            className="text-sm font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors inline-flex items-center gap-1.5"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                            </svg>
                            {t('back', 'Back')}
                        </button>
                    )}
                    
                    <h1 className="text-xl font-bold text-gray-900 dark:text-white tracking-tight flex items-center gap-2">
                        {icon && (
                            <span className={`p-1.5 rounded-lg text-white shadow-md ${iconBgClass}`}>
                                {icon}
                            </span>
                        )}
                        {title}
                    </h1>
                </div>

                <div className="flex items-center gap-3">
                    {/* 1. Portal Target for Customize Columns */}
                    {portalId && (
                        <div id={portalId} className="flex items-center gap-2" />
                    )}

                    {/* 2. Filter Toggle Button */}
                    {filterProps && (
                        <FilterToggleButton
                            isOpen={filterProps.isOpen}
                            onToggle={filterProps.onToggle}
                            activeFiltersCount={filterProps.activeCount}
                        />
                    )}

                    {/* 3. Extra Actions (View Mode Toggles, FAB, etc) */}
                    {children}
                </div>
            </div>
            
            {bottomRow && (
                <div className="w-full mt-3">
                    {bottomRow}
                </div>
            )}
        </header>
    );
}

export default CategoryHeader;
