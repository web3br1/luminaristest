import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useCurrency, SUPPORTED_CURRENCIES } from '@/lib/context/CurrencyContext';

interface CurrencyFieldProps {
  name: string;
  value: unknown;
  onChange: (name: string, value: unknown) => void;
  className: string;
  required?: boolean;
}

/**
 * CurrencyField — Locale-aware currency input with live formatting.
 *
 * Reads the user's active currency from CurrencyContext (BRL/USD/EUR/…) and
 * formats the displayed value using the matching Intl locale + symbol. The
 * underlying stored value is always a plain decimal number — formatting only
 * affects the rendered text.
 */
function CurrencyField({ name, value, onChange, className, required }: CurrencyFieldProps) {
  const { currency } = useCurrency();
  const currencyInfo = useMemo(
    () => SUPPORTED_CURRENCIES.find(c => c.code === currency) ?? SUPPORTED_CURRENCIES[0],
    [currency]
  );
  const activeLocale = currencyInfo.locale;
  const activeSymbol = currencyInfo.symbol;

  // Local display state — formatted with the active locale
  const [displayValue, setDisplayValue] = useState('');

  // Formats number → locale-specific string (e.g. 1234.56 → "1.234,56" pt-BR / "1,234.56" en-US)
  const formatValue = useCallback((val: number | string): string => {
    const num = typeof val === 'number' ? val : parseFloat(String(val).replace(',', '.'));
    if (isNaN(num)) return '';
    return new Intl.NumberFormat(activeLocale, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(num);
  }, [activeLocale]);

  // Sync display state when external value or locale changes
  useEffect(() => {
    if (value !== undefined && value !== null && value !== '') {
      setDisplayValue(formatValue(value as number | string));
    } else {
      setDisplayValue('');
    }
  }, [value, activeLocale, formatValue]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target.value.replace(/\D/g, '');

    if (!input) {
      setDisplayValue('');
      onChange(name, null);
      return;
    }

    // Treat digits as cents → divide by 100 for decimal value
    const numericValue = parseInt(input, 10) / 100;
    setDisplayValue(formatValue(numericValue));
    onChange(name, numericValue);
  };

  return (
    <div className="relative flex items-center group">
      <span className="absolute left-5 text-gray-400 dark:text-neutral-500 text-sm font-bold pointer-events-none group-focus-within:text-blue-500 transition-colors z-10">
        {activeSymbol}
      </span>
      <input
        type="text"
        inputMode="numeric"
        id={name}
        name={name}
        value={displayValue}
        onChange={handleChange}
        className={`${className} !pl-12 font-mono font-medium tracking-tight`}
        required={required}
        placeholder="0,00"
      />
    </div>
  );
}

export default CurrencyField;
