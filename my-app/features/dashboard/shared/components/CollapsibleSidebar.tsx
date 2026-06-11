'use client';

/**
 * CollapsibleSidebar - Sidebar recolhível com estilo premium minimalista
 */

import React, { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'next-i18next';

interface CollapsibleSidebarProps {
    title: string;
    children: React.ReactNode;
    defaultCollapsed?: boolean;
    storageKey?: string;
    width?: number;
    onToggle?: (collapsed: boolean) => void;
}

export function CollapsibleSidebar({
    title,
    children,
    defaultCollapsed = false,
    storageKey,
    width = 280,
    onToggle,
}: CollapsibleSidebarProps) {
    const { t } = useTranslation(['common']);
    const [isCollapsed, setIsCollapsed] = useState(() => {
        if (storageKey && typeof window !== 'undefined') {
            const saved = localStorage.getItem(storageKey);
            return saved === 'true';
        }
        return defaultCollapsed;
    });

    useEffect(() => {
        if (storageKey && typeof window !== 'undefined') {
            localStorage.setItem(storageKey, String(isCollapsed));
        }
    }, [isCollapsed, storageKey]);

    const handleToggle = useCallback(() => {
        setIsCollapsed(prev => {
            const next = !prev;
            onToggle?.(next);
            return next;
        });
    }, [onToggle]);

    return (
        <aside
            className="relative flex-shrink-0 bg-white/95 dark:bg-neutral-900/90 backdrop-blur-sm border-r border-gray-200/80 dark:border-neutral-700/50 transition-all duration-300 ease-out h-full"
            style={{ width: isCollapsed ? 52 : width }}
        >
            {/* Header with Toggle */}
            <div className="flex items-center justify-between h-12 px-4 border-b border-gray-100/80 dark:border-neutral-700/40">
                {!isCollapsed && (
                    <span className="text-sm font-semibold text-gray-800 dark:text-gray-100">
                        {title}
                    </span>
                )}

                <button
                    type="button"
                    onClick={handleToggle}
                    className={`
                        flex items-center justify-center w-7 h-7 rounded-xl
                        text-gray-400 hover:text-gray-700 dark:text-gray-500 dark:hover:text-gray-200
                        hover:bg-gray-100/80 dark:hover:bg-neutral-700/60
                        transition-all duration-150
                        ${isCollapsed ? 'mx-auto' : 'ml-auto'}
                    `}
                    aria-label={isCollapsed ? t('sidebar.expand', 'Expand') : t('sidebar.collapse', 'Collapse')}
                    title={isCollapsed ? t('sidebar.expand_filters', 'Expand filters') : t('sidebar.collapse_filters', 'Collapse filters')}
                >
                    <svg
                        className={`w-3.5 h-3.5 transition-transform duration-200 ${isCollapsed ? 'rotate-180' : ''}`}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                    >
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5L8.25 12l7.5-7.5" />
                    </svg>
                </button>
            </div>

            {/* Content */}
            <div
                className={`
                    h-[calc(100%-48px)] overflow-y-auto overflow-x-hidden
                    transition-opacity duration-200
                    ${isCollapsed ? 'opacity-0 pointer-events-none' : 'opacity-100'}
                `}
            >
                <div className="p-4 space-y-4">
                    {children}
                </div>
            </div>

            {/* Collapsed state icon */}
            {isCollapsed && (
                <div className="flex flex-col items-center pt-3 gap-3">
                    <div className="w-7 h-7 rounded-xl bg-gray-100/80 dark:bg-neutral-700/50 flex items-center justify-center">
                        <svg className="w-3.5 h-3.5 text-gray-500 dark:text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
                        </svg>
                    </div>
                </div>
            )}
        </aside>
    );
}

export default CollapsibleSidebar;
