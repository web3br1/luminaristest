/**
 * Formats an ISO date-only value as dd/mm/aaaa, parsed as local midnight — never
 * shifts a day vs. UTC parsing (same date-only-safe technique as the canonical
 * `formatDate(..., { dateOnly: true })` in dashboard/shared/utils/formatters.ts;
 * reimplemented here because that canonical formats long-form ("01 de jul. de
 * 2026"), not the numeric dd/mm/aaaa these screens require).
 */
export function formatDate(iso: string): string {
  const datePart = iso.slice(0, 10);
  return new Date(datePart + 'T00:00:00').toLocaleDateString('pt-BR');
}
