'use client';

import React from 'react';

interface EmptyStateProps {
    title?: string;
    description?: string;
    /** @deprecated Use `description` instead. Kept for legacy compatibility. */
    message?: string;
    icon?: React.ReactNode;
    action?: React.ReactNode;
    className?: string;
}

/**
 * Empty state placeholder for tables and lists
 * v2.0 - Rich aesthetics for high-level views
 */
export function EmptyState({
    title,
    description,
    message,
    icon,
    action,
    className = ''
}: EmptyStateProps) {
    const displayTitle = title;
    const displayDesc = description || message;

    return (
        <div className={`flex flex-col items-center justify-center py-12 px-6 text-center ${className}`}>
            {icon && (
                <div className="text-gray-200 dark:text-neutral-800 mb-6">
                    {icon}
                </div>
            )}
            {displayTitle && (
                <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2 tracking-tight">
                    {displayTitle}
                </h3>
            )}
            {displayDesc && (
                <p className="text-gray-500 dark:text-gray-400 text-sm max-w-sm mx-auto leading-relaxed">
                    {displayDesc}
                </p>
            )}
            {action && <div className="mt-8">{action}</div>}
        </div>
    );
}
