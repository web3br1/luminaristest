'use client';

/**
 * useRenderTypedValue — currency/locale-aware wrapper around renderTypedValue
 *
 * @description
 * Returns a memoized renderTypedValue function pre-bound to the user's
 * active currency and the correct Intl locale for that currency.
 * Swap currencies in the profile → every table cell re-formats automatically,
 * with zero prop-drilling.
 *
 * Usage:
 *   const renderTypedValue = useRenderTypedValue();
 *   renderTypedValue(value, 'number', { numberFormat: 'currency' });
 */

import { useCallback } from 'react';
import { useTranslation } from 'next-i18next';
import { useCurrency } from '@/lib/context/CurrencyContext';
import { renderTypedValue } from '../utils/formatters';

export function useRenderTypedValue() {
    const { i18n } = useTranslation();
    const { currency } = useCurrency();
    // Locale comes from the active i18n language, with a browser-language fallback —
    // avoids implicit pt-BR default and stays correct for any market the app serves.
    const locale = i18n.language || (typeof navigator !== 'undefined' ? navigator.language : 'en-US');

    return useCallback(
        (value: unknown, fieldType?: string, options?: Parameters<typeof renderTypedValue>[2]) =>
            renderTypedValue(value, fieldType, { locale, currency, ...options }),
        [locale, currency]
    );
}
