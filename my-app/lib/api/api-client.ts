import { getCookie } from 'cookies-next';
import { notify } from '../notifications/notify';

/** Zod `.flatten()` shape returned by controllers on safeParse-fail 400s. */
type ZodFlatten = { formErrors?: string[]; fieldErrors?: Record<string, string[]> };

function isZodFlatten(v: unknown): v is ZodFlatten {
  return typeof v === 'object' && v !== null && ('fieldErrors' in v || 'formErrors' in v);
}

/**
 * Turn a Zod `.flatten()` object into "campo: erro; campo: erro" instead of the
 * `String(obj)` → "[object Object]" the toast used to show. Falls back to a
 * generic hint when the flatten carries no readable messages.
 */
export function humanizeZodFlatten(err: ZodFlatten): string {
  const parts: string[] = [];
  for (const [field, msgs] of Object.entries(err.fieldErrors || {})) {
    if (msgs && msgs.length) parts.push(`${field}: ${msgs.join(', ')}`);
  }
  if (err.formErrors && err.formErrors.length) parts.push(...err.formErrors);
  return parts.length ? parts.join('; ') : 'Verifique os campos e tente novamente.';
}

/** Extract a human-readable message from a parsed error body. */
export function extractErrorMessage(result: Record<string, unknown>, status: number, statusText: string): string {
  if (isZodFlatten(result?.error)) return humanizeZodFlatten(result.error as ZodFlatten);
  return String(result?.message || result?.error || `Erro ${status}: ${statusText}`);
}

/**
 * Global API Client for Luminaris Frontend.
 * Centralizes endpoint management, auth headers, and error parsing.
 */
class ApiClient {
  private get baseUrl() {
    return process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001/api';
  }

  private getHeaders(customHeaders?: HeadersInit): HeadersInit {
    const token = getCookie('auth_token');

    // Safety check for SSR/Node environment where Intl.DateTimeFormat might behave differently
    let timezone = 'UTC';
    try {
      if (typeof Intl !== 'undefined') {
        timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      }
    } catch (e) {
      // fallback to UTC
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-user-timezone': timezone,
      ...((customHeaders as Record<string, string>) || {}),
    };

    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    return headers as HeadersInit;
  }

  /**
   * Universal request handler with automatic error parsing.
   */
  private async request<T>(path: string, options: RequestInit): Promise<T> {
    const url = `${this.baseUrl}${path.startsWith('/') ? path : `/${path}`}`;

    try {
      const response = await fetch(url, {
        ...options,
        headers: this.getHeaders(options.headers),
      });

      const bodyText = await response.text();
      let result: Record<string, unknown>;

      try {
        result = bodyText ? JSON.parse(bodyText) : {};
      } catch {
        result = { error: 'Failed to parse server response' };
      }

      if (!response.ok) {
        const errorMessage = extractErrorMessage(result, response.status, response.statusText);
        notify(errorMessage, 'error', 'Erro');
        // Return the parsed error object (usually { success: false, error: '...' }),
        // tagged with the HTTP status so callers can branch (e.g. `if (o.status === 400)`).
        throw { ...result, status: response.status };
      }

      return result as T;
    } catch (error) {
      // Re-throw if it's already our parsed error object, otherwise wrap it
      if (typeof error === 'object' && error !== null && ('error' in error || 'message' in error)) {
        throw error;
      }
      throw { error: (error as Error).message || 'Network request failed' };
    }
  }

  public get<T>(path: string, options?: RequestInit): Promise<T> {
    return this.request<T>(path, { ...options, method: 'GET' });
  }

  public post<T>(path: string, body: object, options?: RequestInit): Promise<T> {
    return this.request<T>(path, {
      ...options,
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  public put<T>(path: string, body: object, options?: RequestInit): Promise<T> {
    return this.request<T>(path, {
      ...options,
      method: 'PUT',
      body: JSON.stringify(body),
    });
  }

  public delete<T>(path: string, options?: RequestInit): Promise<T> {
    return this.request<T>(path, { ...options, method: 'DELETE' });
  }

  public patch<T>(path: string, body: object, options?: RequestInit): Promise<T> {
    return this.request<T>(path, {
      ...options,
      method: 'PATCH',
      body: JSON.stringify(body),
    });
  }
}

export const apiClient = new ApiClient();
