'use client';

import React from 'react';

interface FilterGroupProps {
    label?: string;
    icon?: React.ReactNode;
    children: React.ReactNode;
    className?: string;
    labelClassName?: string;
}

/**
 * FilterGroup - Replicates the label + control styling from the sidebars
 */
export function FilterGroup({
    label,
    icon,
    children,
    className = '',
    labelClassName = ''
}: FilterGroupProps) {
    return (
        <div className={`flex flex-col gap-1.5 min-w-[140px] flex-shrink-0 ${className}`}>
            {label && (
                <label className={`block text-[10px] font-black text-gray-400 dark:text-neutral-500 uppercase tracking-widest pl-1 flex items-center gap-1.5 ${labelClassName}`}>
                    {icon}
                    {label}
                </label>
            )}
            <div className="flex items-center gap-2">
                {children}
            </div>
        </div>
    );
}

export default FilterGroup;
