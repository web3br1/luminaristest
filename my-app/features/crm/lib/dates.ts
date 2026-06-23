// Shared date formatters for the CRM lead panels. Previously each panel
// (notes / tasks / attachments / timeline) carried its own near-identical copy;
// consolidated here so there is one source of truth.

/** Full date+time, locale-formatted. Falls back to the raw value if unparseable. */
export function formatTimestamp(value: unknown): string {
  const raw = String(value ?? '');
  if (!raw) return '—';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleString();
}

/** Date only (no time), locale-formatted. Falls back to the raw value if unparseable. */
export function formatDate(value: unknown): string {
  const raw = String(value ?? '');
  if (!raw) return '—';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString();
}

type TFn = (key: string, fallback: string) => string;
const identity: TFn = (_, fb) => fb;

/**
 * Relative day-group label for timeline headers. Pass the `t` function from
 * `useTranslation('crm')` to honour the UI locale; omit to fall back to pt-BR
 * string literals (legacy behaviour). Date formatting uses the browser locale.
 */
export function formatDayLabel(dateIso: string, t: TFn = identity): string {
  const d = new Date(dateIso);
  const today = new Date();
  const dayMs = 24 * 60 * 60 * 1000;
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((startOf(today) - startOf(d)) / dayMs);
  if (diff === 0) return t('timeline.today', 'Hoje');
  if (diff === 1) return t('timeline.yesterday', 'Ontem');
  if (diff <= 7) return d.toLocaleDateString(undefined, { weekday: 'long', day: '2-digit', month: 'short' });
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}
