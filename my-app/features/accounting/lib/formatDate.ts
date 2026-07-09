import { formatDateNumericBR } from '@/features/dashboard/shared/utils/formatters';

/**
 * Formats an ISO date-only value as dd/mm/aaaa, parsed as local midnight — never
 * shifts a day vs. UTC parsing.
 *
 * Thin wrapper over the canonical numeric + date-only-safe `formatDateNumericBR`.
 * Kept as a named export so its four callers (BalanceSheet/IncomeStatement/
 * JournalEntries/Ledger panels) don't have to change their imports. Passing
 * `iso.slice(0, 10)` preserves the exact previous semantics: only the date part
 * is taken and formatted as local midnight, byte-identical for the ISO strings
 * these screens receive.
 */
export function formatDate(iso: string): string {
  return formatDateNumericBR(iso.slice(0, 10));
}
