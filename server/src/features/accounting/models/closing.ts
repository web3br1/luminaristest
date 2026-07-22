/**
 * Year-end closing (encerramento do resultado) domain constants
 * (BE-INCR-SPED-APURACAO). Single source of truth for the marker that three
 * services key on — the closing service SETS it, the report service EXCLUDES it
 * from the DRE (D3), and the SPED exporter maps it to I200.IND_LCTO='E' (D7).
 */

/** JournalEntry.sourceType tag identifying a closing entry (lançamento de encerramento). */
export const CLOSING_SOURCE_TYPE = 'closing';

/** SPED IND_LCTO value for a closing entry (Leiaute 9, I200 field 05). */
export const IND_LCTO_ENCERRAMENTO = 'E';

/** Builds the idempotency sourceId for the closing entry of a fiscal year. */
export function closingSourceId(year: number): string {
  return String(year);
}

/**
 * Frees the idempotency key when a closing entry is reversed (reopenExercise, D5):
 * the reversed entry's sourceId is renamed so `closingSourceId(year)` is available
 * again for a fresh close. Ties to memory `unique-de-idempotencia-x-soft-delete`.
 */
export function reversedClosingSourceId(year: number, reversedEntryId: string): string {
  return `${CLOSING_SOURCE_TYPE}:${year}:reversed:${reversedEntryId}`;
}
