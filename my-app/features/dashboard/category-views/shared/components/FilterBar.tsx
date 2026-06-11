'use client';

import React from 'react';

interface FilterBarProps {
    children: React.ReactNode;
    className?: string;
    isOpen?: boolean;
}

/**
 * FilterBar - Horizontal container for filters
 * Now supports collapsing/expanding to save vertical space.
 */
export function FilterBar({ children, className = '', isOpen = true }: FilterBarProps) {
    return (
        <div
            className={`
                grid transition-all duration-300 ease-in-out
                ${isOpen
                    ? 'grid-rows-[1fr] opacity-100 border-b border-gray-200/80 dark:border-neutral-700/50'
                    : 'grid-rows-[0fr] opacity-0 border-b-0'
                }
                bg-white/95 dark:bg-neutral-900/90 backdrop-blur-sm
            `}
        >
            <div className="overflow-hidden">
                <div className={`flex items-center gap-6 px-4 py-3 overflow-x-auto custom-scrollbar ${className}`}>
                    {children}
                </div>
            </div>
        </div>
    );
}

export default FilterBar;
