import { TFunction } from 'i18next';

/**
 * Universal error resolver for Frontend.
 * Takes a server error (as object or string) and returns a human-readable string.
 */
export function resolveErrorMessage(err: unknown, t: TFunction): string {
  try {
    if (!err) return t('common:unexpectedError', 'Unexpected error.');
    
    if (typeof err === 'string') return err;
    
    if (typeof err === 'object') {
      const anyErr = err as Record<string, unknown>;

      // Standard backend error response format: { success, error: string }
      if (anyErr.error && typeof anyErr.error === 'string') return anyErr.error;

      // Axios-style or standard JS error message: { message: string }
      if (anyErr.message && typeof anyErr.message === 'string') return anyErr.message;

      // Raw error details as JSON fallback
      if (anyErr.details) return JSON.stringify(anyErr.details);
    }
  } catch (parseError) {
    console.warn('[resolveErrorMessage] Failed to parse error:', parseError);
  }
  
  return t('common:unexpectedError', 'Unexpected error.');
}
