/**
 * Canonical error resolver for the accounting frontend.
 *
 * `apiClient` throws a PLAIN OBJECT (not an Error): `{ ...serverBody, status }`,
 * where the server body is usually `{ success: false, error: string }` and, for
 * wrapped network failures, `{ error: string }`. Some endpoints (AP/AR) also
 * attach a machine-readable `code` so callers can branch (e.g. period-closed).
 *
 * This module promotes the `resolveError` technique that was re-inlined in 14
 * accounting components (Council N7) into a single canonical helper — same
 * precedent as `formatDateNumericBR` (see `./formatDate.ts`). 13 of the 14
 * call sites were migrated in this change; the last clone lives in
 * `../components/JournalEntryModal.tsx`, deliberately left untouched because a
 * concurrent parseBrl fix owns that file — migrate it to this helper once that
 * fix lands (tracked as follow-up).
 *
 * Field precedence is `message` → `error` (the majority order among the former
 * clones): controller errors carry only `error`, while the global 500 handler
 * sends both (`error: 'Internal server error'` + a more specific `message`),
 * so `message`-first surfaces the more useful text. Only STRING fields are ever
 * returned — an object `error` (e.g. a flattened Zod 400) falls through to the
 * caller's fallback, never rendering as "[object Object]".
 */

/** Extract a human message + optional error code from apiClient's thrown error object. */
export function resolveErrorWithCode(
  e: unknown,
  fallback: string
): { message: string; code?: string } {
  if (e && typeof e === 'object') {
    const o = e as { error?: unknown; message?: unknown; code?: unknown };
    const code = typeof o.code === 'string' ? o.code : undefined;
    if (typeof o.message === 'string') return { message: o.message, code };
    if (typeof o.error === 'string') return { message: o.error, code };
    return { message: fallback, code };
  }
  return { message: fallback };
}

/** Extract a human message from apiClient's thrown error object. */
export function resolveError(e: unknown, fallback: string): string {
  return resolveErrorWithCode(e, fallback).message;
}
