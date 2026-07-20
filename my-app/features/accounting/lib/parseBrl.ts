/**
 * Parse a money input string to integer cents. BR convention: comma is the
 * decimal separator, dots group thousands ("1.234,56" → 123456). Tolerates a
 * US-style dot-decimal ("1234.56", "19.99") only when there is no comma and the
 * dot is followed by 1–2 digits — otherwise a lone dot is a thousands separator
 * ("1.000" → 100000), so a dot typed as decimal never books a 100× entry.
 *
 * Canonical for every accounting money modal — do not re-inline. A naive
 * `s.replace(',', '.')` corrupts thousands input silently ("1.234,56" → R$ 1,23),
 * and since debit and credit share the parser the entry still balances and posts.
 */
export function parseBrl(s: string): number {
  const trimmed = (s || '').trim();
  let normalised: string;
  if (trimmed.includes(',')) {
    normalised = trimmed.replace(/\./g, '').replace(',', '.');
  } else if (/\.\d{1,2}$/.test(trimmed)) {
    normalised = trimmed; // lone dot with ≤2 trailing digits → decimal point
  } else {
    normalised = trimmed.replace(/\./g, ''); // dots are thousands separators
  }
  const parsed = parseFloat(normalised || '0');
  return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}
