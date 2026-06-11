'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'next-i18next';
import { useFormatCurrency } from '@/lib/context/CurrencyContext';
import { parseBRL } from '../../../utils/formatters';

// ─────────────────────────────────────────────────────────────
// Module-level constants
// ─────────────────────────────────────────────────────────────

const PRESETS = [0, 7, 15, 30, 60];

// ─────────────────────────────────────────────────────────────
// QuantityInput
// ─────────────────────────────────────────────────────────────

interface QuantityInputProps {
    value: number;
    onChange: (value: number) => void;
    min?: number;
    max?: number;
}

export function QuantityInput({ value, onChange, min = 1, max = 9999 }: QuantityInputProps) {
    const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const parsed = parseInt(e.target.value, 10);
        if (!isNaN(parsed)) {
            onChange(Math.max(min, Math.min(max, parsed)));
        }
    };

    return (
        <div className="inline-flex items-center rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden bg-white dark:bg-neutral-800">
            <button
                type="button"
                onClick={() => onChange(Math.max(min, value - 1))}
                disabled={value <= min}
                className="w-8 h-8 flex-shrink-0 flex items-center justify-center bg-gray-50 dark:bg-neutral-700/60 text-gray-500 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-neutral-600/60 hover:text-gray-700 dark:hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M20 12H4" />
                </svg>
            </button>
            <input
                type="text"
                inputMode="numeric"
                value={value}
                onChange={handleTextChange}
                className="w-10 h-8 text-center text-sm font-bold bg-transparent text-gray-900 dark:text-white border-x border-gray-200 dark:border-gray-700 focus:outline-none transition-colors"
            />
            <button
                type="button"
                onClick={() => onChange(Math.min(max, value + 1))}
                disabled={value >= max}
                className="w-8 h-8 flex-shrink-0 flex items-center justify-center bg-gray-50 dark:bg-neutral-700/60 text-gray-500 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-neutral-600/60 hover:text-gray-700 dark:hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
            </button>
        </div>
    );
}

// ─────────────────────────────────────────────────────────────
// PaymentTermChips
// ─────────────────────────────────────────────────────────────

interface PaymentTermChipsProps {
    value: number;
    onChange: (value: number) => void;
}

export function PaymentTermChips({ value, onChange }: PaymentTermChipsProps) {
    const { t } = useTranslation(['finance_view']);
    const isCustomValue = !PRESETS.includes(value);
    const [customOpen, setCustomOpen] = useState(isCustomValue);
    const inputRef = useRef<HTMLInputElement>(null);

    // Auto-focus when chip expands
    useEffect(() => {
        if (customOpen) {
            inputRef.current?.focus();
        }
    }, [customOpen]);

    // Sync customOpen when value is reset externally (e.g. wizard reset)
    useEffect(() => {
        if (PRESETS.includes(value)) {
            setCustomOpen(false);
        }
    }, [value]);

    return (
        <div className="flex flex-wrap gap-2 items-center">
            {PRESETS.map(days => (
                <button
                    key={days}
                    type="button"
                    onClick={() => { onChange(days); setCustomOpen(false); }}
                    className={`px-4 py-2 text-sm font-medium rounded-xl border transition ${
                        value === days
                            ? 'bg-blue-600 text-white border-blue-600 shadow-sm'
                            : 'bg-white dark:bg-neutral-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-700 hover:border-blue-400 hover:text-blue-600'
                    }`}
                >
                    {days === 0
                        ? t('finance_view:sales.wizard.cash', 'À vista')
                        : t('finance_view:sales.wizard.days', '{{count}} dias', { count: days })}
                </button>
            ))}

            {/* "Outro" — colapsado como chip de texto; expande inline ao clicar */}
            {(!customOpen && !isCustomValue) ? (
                <button
                    type="button"
                    onClick={() => setCustomOpen(true)}
                    className="px-4 py-2 text-sm font-medium rounded-xl border border-dashed border-gray-300 dark:border-gray-600 bg-white dark:bg-neutral-800 text-gray-500 dark:text-gray-400 hover:border-blue-400 hover:text-blue-600 transition"
                >
                    {t('finance_view:sales.wizard.other', 'Outro')}
                </button>
            ) : (
                <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl border text-sm font-medium transition-all ${
                    isCustomValue
                        ? 'bg-blue-600 border-blue-600 shadow-sm'
                        : 'bg-white dark:bg-neutral-800 border-blue-400 dark:border-blue-500'
                }`}>
                    <input
                        ref={inputRef}
                        type="number"
                        value={isCustomValue ? value : ''}
                        onChange={e => {
                            const v = Number(e.target.value);
                            if (v > 0) onChange(v);
                        }}
                        onBlur={() => { if (!isCustomValue) setCustomOpen(false); }}
                        placeholder="45"
                        min={1}
                        className={`w-10 bg-transparent focus:outline-none text-center font-medium ${
                            isCustomValue ? 'text-white' : 'text-gray-700 dark:text-gray-300'
                        }`}
                    />
                    <span className={`text-xs ${isCustomValue ? 'text-blue-100' : 'text-gray-500 dark:text-gray-400'}`}>
                        {t('finance_view:sales.wizard.days_label', 'dias')}
                    </span>
                </div>
            )}
        </div>
    );
}

// ─────────────────────────────────────────────────────────────
// CurrencyInput
// ─────────────────────────────────────────────────────────────

interface CurrencyInputProps {
    value: number;
    onChange: (value: number) => void;
    placeholder?: string;
    /** Override the input's className entirely. Omit for the default solid style. */
    className?: string;
}

export function CurrencyInput({ value, onChange, placeholder, className }: CurrencyInputProps) {
    const formatCurrency = useFormatCurrency();
    const [displayValue, setDisplayValue] = useState(formatCurrency(value));

    useEffect(() => {
        setDisplayValue(formatCurrency(value));
    }, [value, formatCurrency]);

    const handleBlur = () => {
        const parsed = parseBRL(displayValue);
        onChange(parsed);
        setDisplayValue(formatCurrency(parsed));
    };

    return (
        <input
            type="text"
            inputMode="decimal"
            value={displayValue}
            onChange={e => setDisplayValue(e.target.value)}
            onBlur={handleBlur}
            placeholder={placeholder}
            className={
                className ??
                'w-full px-3 py-2 rounded-lg bg-white dark:bg-neutral-800 border border-gray-200 dark:border-gray-700 text-sm text-right font-bold text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500'
            }
        />
    );
}
