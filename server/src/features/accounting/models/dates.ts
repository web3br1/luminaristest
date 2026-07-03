/**
 * Shared date-only validation for the accounting module (same "one canonical
 * home" rationale as money.ts/MAX_CENTS).
 *
 * A YYYY-MM-DD regex alone does NOT validate the calendar: JS Date silently
 * rolls day overflow forward ('2026-02-30' -> 2026-03-02, '2026-06-31' ->
 * 2026-07-01), so a regex-only boundary lets an invalid date MUTATE silently —
 * distorting fiscal-year derivation, the D6 ±3-day matching window and any
 * dated report. The round-trip check (parse at UTC midnight, format back,
 * compare) closes the whole class.
 */
export const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** True iff `s` is a real calendar date in strict YYYY-MM-DD form. */
export function isValidDateOnly(s: string): boolean {
  if (!DATE_ONLY_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}
