import React, { useMemo } from 'react';
import { useCurrency, SUPPORTED_CURRENCIES } from '@/lib/context/CurrencyContext';

interface PercentageFieldProps {
  name: string;
  value: unknown;
  onChange: (name: string, value: unknown) => void;
  className: string;
  required?: boolean;
}

/**
 * Locale-aware percent formatter. Uses the active currency's locale so the
 * decimal separator matches user preference (pt-BR → "1,5%" / en-US → "1.5%").
 */
function formatPercent(value: number | undefined, locale: string) {
  const n = Number.isFinite(value as number) ? (value as number) : 0;
  return `${n.toLocaleString(locale, { maximumFractionDigits: 2 })}%`;
}

/**
 * Parses a percent string back to number, accepting both decimal separators.
 * Clamps to [0, 100].
 */
function parsePercent(input: string): number {
  if (!input) return 0;
  // Strip non-numeric, normalize separators to dot
  const cleaned = input.replace(/[^0-9,.-]/g, '').replace(/\./g, '').replace(',', '.');
  const num = parseFloat(cleaned);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.min(100, num));
}

function PercentageField({ name, value, onChange, className, required }: PercentageFieldProps) {
  const { currency } = useCurrency();
  const activeLocale = useMemo(() => {
    const info = SUPPORTED_CURRENCIES.find(c => c.code === currency) ?? SUPPORTED_CURRENCIES[0];
    return info.locale;
  }, [currency]);

  function handleChange(event: React.ChangeEvent<HTMLInputElement>) {
    const parsed = parsePercent(event.target.value);
    const clamped = Math.max(0, Math.min(100, parsed));
    onChange(name, clamped);
  }

  return (
    <input
      type="text"
      inputMode="decimal"
      id={name}
      name={name}
      value={formatPercent(typeof value === 'number' ? value : parsePercent(String(value || '')), activeLocale)}
      onChange={handleChange}
      className={className}
      required={required}
    />
  );
}

export default PercentageField;
