'use client';

import { useState, useCallback, useRef, ReactNode } from 'react';
import React from 'react';
import { ConfirmModal, ConfirmModalVariant } from './ConfirmModal';

// =============================================================================
// TYPES
// =============================================================================

export interface UseConfirmModalOptions {
    title?: string;
    message?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    variant?: ConfirmModalVariant;
    /** Handler assíncrono que roda enquanto o modal fica aberto com spinner */
    onConfirm: () => Promise<void>;
}

interface UseConfirmModalReturn {
    /**
     * Render this node somewhere in your component tree (or at the root of
     * your view). It renders nothing when no confirmation is pending.
     */
    confirmNode: ReactNode;

    /**
     * Call this to open the confirmation dialog imperatively.
     * The modal stays open with a spinner while `onConfirm` executes.
     * Returns a Promise that resolves when the user closes the dialog or the
     * action is completed.
     */
    confirm: (options: UseConfirmModalOptions) => Promise<void>;
}

// =============================================================================
// HOOK
// =============================================================================

export function useConfirmModal(): UseConfirmModalReturn {
    const [isOpen, setIsOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [options, setOptions] = useState<UseConfirmModalOptions | null>(null);

    // Holds the resolve function of the current Promise so we can
    // resolve it from the confirm / cancel handlers.
    const resolveRef = useRef<(() => void) | null>(null);

    const confirm = useCallback((opts: UseConfirmModalOptions): Promise<void> => {
        setOptions(opts);
        setIsOpen(true);
        return new Promise<void>((resolve) => {
            resolveRef.current = resolve;
        });
    }, []);

    const handleConfirm = useCallback(async () => {
        if (!options) return;
        try {
            setIsLoading(true);
            await options.onConfirm();
            // Só executa se o onConfirm não der throw (sucesso)
        } catch (err) {
            // Absorve o erro para não causar Uncaught Promise Rejection (que derruba o Next.js).
            // O componente chamador (ex: SalesView) já exibiu o Toast de erro antes do throw.
            console.error('[useConfirmModal] Action failed (caught in handleConfirm):', err);
        } finally {
            setIsLoading(false);
            setIsOpen(false);
            resolveRef.current?.();
            resolveRef.current = null;
        }
    }, [options]);

    const handleClose = useCallback(() => {
        resolveRef.current?.();
        resolveRef.current = null;
        setIsOpen(false);
    }, []);

    // IMPORTANTE: não fazer spread de options diretamente pois options.onConfirm
    // (a ação assíncrona) sobrescreveria o handleConfirm (o handler do botão com
    // try/catch/spinner). Passamos cada prop manualmente para evitar o conflito.
    const confirmNode = React.createElement(ConfirmModal, {
        isOpen,
        onClose: handleClose,
        onConfirm: handleConfirm,
        isLoading,
        title: options?.title,
        message: options?.message,
        confirmLabel: options?.confirmLabel,
        cancelLabel: options?.cancelLabel,
        variant: options?.variant,
    });

    return { confirmNode, confirm };
}
