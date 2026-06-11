'use client';

import React, { createContext, useContext, useCallback, ReactNode } from 'react';
import { useAuth } from './AuthContext';

import { UserService } from '../services/user.service';

// ─────────────────────────────────────────────
// Supported currencies
// ─────────────────────────────────────────────

export const SUPPORTED_CURRENCIES = [
  { code: 'BRL', label: 'Real Brasileiro', symbol: 'R$', flag: '🇧🇷', locale: 'pt-BR' },
  { code: 'USD', label: 'Dólar Americano', symbol: '$',  flag: '🇺🇸', locale: 'en-US' },
  { code: 'EUR', label: 'Euro',            symbol: '€',  flag: '🇪🇺', locale: 'de-DE' },
] as const;

export type SupportedCurrency = typeof SUPPORTED_CURRENCIES[number]['code'];

/** Map from currency code to the best Intl locale for formatting */
const CURRENCY_LOCALE_MAP: Record<string, string> = {
  BRL: 'pt-BR',
  USD: 'en-US',
  EUR: 'de-DE',
};

// ─────────────────────────────────────────────
// Context shape
// ─────────────────────────────────────────────

interface CurrencyContextType {
  /** Current currency code (e.g., 'BRL', 'USD', 'EUR') */
  currency: string;
  /** Current locale code (e.g., 'en', 'pt') */
  locale: string;
  /** Format a number as currency using the user's settings */
  formatCurrency: (value: number | null | undefined) => string;
  /** Update the user's currency preference (saves to DB) */
  setCurrency: (currency: string) => Promise<void>;
}

const CurrencyContext = createContext<CurrencyContextType | undefined>(undefined);

// ─────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────

interface CurrencyProviderProps {
  children: ReactNode;
}

export function CurrencyProvider({ children }: CurrencyProviderProps) {
  const { user, login: updateAuth } = useAuth();

  const currency = user?.currency || 'BRL';
  const locale   = user?.locale   || 'en';

  // Derive the Intl locale for the current currency (e.g. BRL → pt-BR)
  const intlLocale = CURRENCY_LOCALE_MAP[currency] || 'en-US';

  /**
   * Format a numeric value as currency using the user's active currency and locale.
   * Falls back to BRL formatting if the user is not authenticated.
   */
  const formatCurrency = useCallback((value: number | null | undefined): string => {
    const n = typeof value === 'number' && isFinite(value) ? value : 0;
    try {
      return new Intl.NumberFormat(intlLocale, {
        style: 'currency',
        currency,
      }).format(n);
    } catch {
      // Safety fallback
      return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(n);
    }
  }, [currency, intlLocale]);

  /**
   * Persist a new currency preference to the database and update local context.
   * The PATCH call is fire-and-forget — UI is updated optimistically.
   */
  const setCurrency = useCallback(async (newCurrency: string) => {
    if (!user) return;

    // Optimistic update
    updateAuth({ ...user, currency: newCurrency });

    try {
      await UserService.updatePreferences({ currency: newCurrency });
    } catch (err) {
      console.error('[CurrencyContext] Failed to save currency preference:', err);
      // Revert on failure
      updateAuth({ ...user, currency: user.currency });
    }
  }, [user, updateAuth]);

  return (
    <CurrencyContext.Provider value={{ currency, locale, formatCurrency, setCurrency }}>
      {children}
    </CurrencyContext.Provider>
  );
}

// ─────────────────────────────────────────────
// Hooks
// ─────────────────────────────────────────────

/**
 * Access the full currency context (currency code, locale, formatCurrency, setCurrency).
 */
export function useCurrency(): CurrencyContextType {
  const ctx = useContext(CurrencyContext);
  if (!ctx) throw new Error('useCurrency must be used within a CurrencyProvider');
  return ctx;
}

/**
 * Convenience hook: returns just the formatCurrency function.
 * Use this in components that only need to format values.
 */
export function useFormatCurrency(): (value: number | null | undefined) => string {
  return useCurrency().formatCurrency;
}
