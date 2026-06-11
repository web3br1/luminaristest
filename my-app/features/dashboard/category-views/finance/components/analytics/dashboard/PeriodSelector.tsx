'use client';

import React from 'react';
import type { DatePreset } from '../../../types/analytics.types';

// =============================================================================
// TYPES
// =============================================================================

interface PeriodSelectorProps {
    /** Currently active period */
    value: DatePreset;
    /** Callback when period changes */
    onChange: (preset: DatePreset) => void;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const PERIOD_OPTIONS: { value: DatePreset; label: string }[] = [
    { value: 'thisMonth', label: 'Este Mês' },
    { value: 'lastMonth', label: 'Mês Passado' },
    { value: 'last30Days', label: 'Últ. 30 Dias' },
    { value: 'thisYear', label: 'Este Ano' },
];

// =============================================================================
// COMPONENT
// =============================================================================

/**
 * PeriodSelector — Compact pill buttons for switching the analytics date preset.
 */
export default function PeriodSelector({ value, onChange }: PeriodSelectorProps) {
    return (
        <div className="flex items-center gap-1.5">
            {PERIOD_OPTIONS.map((opt) => {
                const isActive = value === opt.value;
                return (
                    <button
                        key={opt.value}
                        onClick={() => onChange(opt.value)}
                        className={`
                            px-3 py-1.5 rounded-lg text-[11px] font-semibold
                            transition-all duration-150 whitespace-nowrap
                            ${isActive
                                ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-500/25'
                                : 'bg-gray-100 dark:bg-neutral-800 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-neutral-700 hover:text-gray-700 dark:hover:text-gray-300'
                            }
                        `}
                    >
                        {opt.label}
                    </button>
                );
            })}
        </div>
    );
}
