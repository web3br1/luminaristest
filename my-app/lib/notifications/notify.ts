/**
 * Global notification utility — SAP-style event bus.
 *
 * Dispatches a browser CustomEvent that ToastProvider listens to.
 * Works in any context: React components, hooks, services, apiClient.
 * No React imports, no hooks, no Provider dependency.
 */

export type NotifyType = 'success' | 'error' | 'warning' | 'info';

export interface NotifyOptions {
    message: string;
    type?: NotifyType;
    title?: string;
}

export function notify(message: string, type: NotifyType = 'info', title?: string): void {
    if (typeof window === 'undefined') {
        console.warn('[notify] called server-side — SSR guard triggered, skipping.');
        return;
    }
    console.log(`[notify] dispatching event — type="${type}" message="${message}"`);
    window.dispatchEvent(
        new CustomEvent('app:notify', {
            detail: { message, type, title } satisfies NotifyOptions,
        })
    );
    console.log('[notify] dispatchEvent done');
}
