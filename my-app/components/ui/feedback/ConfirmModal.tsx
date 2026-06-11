'use client';

import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { MdWarningAmber, MdInfoOutline, MdErrorOutline, MdClose } from 'react-icons/md';

// =============================================================================
// TYPES
// =============================================================================

export type ConfirmModalVariant = 'danger' | 'warning' | 'info';

export interface ConfirmModalOptions {
    /** Dialog title */
    title?: string;
    /** Descriptive message body */
    message?: string;
    /** Label for the confirm button (default varies by variant) */
    confirmLabel?: string;
    /** Label for the cancel button */
    cancelLabel?: string;
    /** Visual variant: danger (red), warning (amber), info (blue). Default: 'danger' */
    variant?: ConfirmModalVariant;
}

interface ConfirmModalProps extends ConfirmModalOptions {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    /** Show loading spinner on confirm button */
    isLoading?: boolean;
    /** Error message to display inside the modal */
    error?: string | null;
}

// =============================================================================
// VARIANT CONFIG
// =============================================================================

const VARIANT_CONFIG: Record<
    ConfirmModalVariant,
    {
        icon: React.ReactNode;
        iconBg: string;
        confirmBg: string;
        confirmHover: string;
        confirmShadow: string;
        defaultTitle: string;
        defaultConfirmLabel: string;
        accentBar: string;
    }
> = {
    danger: {
        icon: <MdWarningAmber size={22} className="text-red-600 dark:text-red-400" />,
        iconBg: 'bg-red-100 dark:bg-red-950/50',
        confirmBg: 'bg-red-600',
        confirmHover: 'hover:bg-red-700 active:bg-red-800',
        confirmShadow: 'shadow-red-600/20',
        defaultTitle: 'Confirmar ação?',
        defaultConfirmLabel: 'Sim, confirmar',
        accentBar: 'bg-red-600',
    },
    warning: {
        icon: <MdWarningAmber size={22} className="text-amber-600 dark:text-amber-400" />,
        iconBg: 'bg-amber-100 dark:bg-amber-950/50',
        confirmBg: 'bg-amber-600',
        confirmHover: 'hover:bg-amber-700 active:bg-amber-800',
        confirmShadow: 'shadow-amber-600/20',
        defaultTitle: 'Tem certeza?',
        defaultConfirmLabel: 'Sim, prosseguir',
        accentBar: 'bg-amber-500',
    },
    info: {
        icon: <MdInfoOutline size={22} className="text-blue-600 dark:text-blue-400" />,
        iconBg: 'bg-blue-100 dark:bg-blue-950/50',
        confirmBg: 'bg-blue-600',
        confirmHover: 'hover:bg-blue-700 active:bg-blue-800',
        confirmShadow: 'shadow-blue-600/20',
        defaultTitle: 'Confirmar?',
        defaultConfirmLabel: 'Confirmar',
        accentBar: 'bg-blue-600',
    },
};

// =============================================================================
// COMPONENT
// =============================================================================

/**
 * ConfirmModal — Generic, reusable confirmation dialog.
 *
 * Supports three visual variants (danger / warning / info), loading state,
 * inline error display, and fully customizable labels.
 *
 * For imperative usage (no state boilerplate), use the `useConfirmModal` hook.
 *
 * @example
 * // Declarative
 * <ConfirmModal
 *   isOpen={isOpen}
 *   onClose={() => setOpen(false)}
 *   onConfirm={handleDelete}
 *   variant="danger"
 *   title="Inativar registro?"
 *   confirmLabel="Sim, inativar"
 *   isLoading={isDeleting}
 * />
 */
export function ConfirmModal({
    isOpen,
    onClose,
    onConfirm,
    title,
    message,
    confirmLabel,
    cancelLabel = 'Não, fechar',
    variant = 'danger',
    isLoading = false,
    error = null,
}: ConfirmModalProps) {
    // ESC key closes the modal — must be called before any early return (Rules of Hooks)
    useEffect(() => {
        if (!isOpen) return;
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape' && !isLoading) onClose();
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, isLoading, onClose]);

    if (!isOpen) return null;

    const cfg = VARIANT_CONFIG[variant];
    const resolvedTitle = title ?? cfg.defaultTitle;
    const resolvedConfirmLabel = confirmLabel ?? cfg.defaultConfirmLabel;

    const modal = (
        <div
            className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
            role="dialog"
            aria-modal="true"
            aria-labelledby="confirm-modal-title"
        >
            <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl w-full max-w-md overflow-hidden relative animate-in zoom-in-95 duration-200">
                {/* Accent bar */}
                <div className={`h-1 w-full ${cfg.accentBar} opacity-80`} />

                {/* Header */}
                <div className="flex items-start justify-between px-6 py-5 border-b border-gray-100 dark:border-neutral-800">
                    <div className="flex items-center gap-4">
                        <div className={`p-2.5 ${cfg.iconBg} rounded-full shrink-0`}>
                            {cfg.icon}
                        </div>
                        <h2
                            id="confirm-modal-title"
                            className="text-base font-bold text-gray-900 dark:text-white leading-snug"
                        >
                            {resolvedTitle}
                        </h2>
                    </div>
                    <button
                        onClick={onClose}
                        disabled={isLoading}
                        className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors p-1 ml-2 disabled:opacity-40"
                        aria-label="Fechar"
                    >
                        <MdClose size={20} />
                    </button>
                </div>

                {/* Body */}
                <div className="px-6 py-5 space-y-4">
                    {error && (
                        <div className="p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl text-xs text-red-600 dark:text-red-400 font-medium animate-in slide-in-from-top-2">
                            {error}
                        </div>
                    )}
                    {message && (
                        <p className="text-sm text-gray-600 dark:text-gray-400 leading-relaxed">
                            {message}
                        </p>
                    )}
                </div>

                {/* Footer */}
                <div className="bg-gray-50/50 dark:bg-neutral-800/20 px-6 py-4 flex gap-3 justify-end border-t border-gray-100 dark:border-neutral-800">
                    <button
                        onClick={onClose}
                        disabled={isLoading}
                        className="px-4 py-2 text-sm font-semibold text-gray-700 dark:text-gray-300 hover:bg-white dark:hover:bg-neutral-800 border border-gray-200 dark:border-neutral-700 rounded-xl transition-colors disabled:opacity-50"
                    >
                        {cancelLabel}
                    </button>
                    <button
                        onClick={onConfirm}
                        disabled={isLoading}
                        className={`px-4 py-2 text-sm font-bold text-white ${cfg.confirmBg} ${cfg.confirmHover} rounded-xl transition-colors shadow-sm ${cfg.confirmShadow} disabled:opacity-50 flex items-center gap-2`}
                    >
                        {isLoading ? (
                            <>
                                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                Aguarde...
                            </>
                        ) : (
                            resolvedConfirmLabel
                        )}
                    </button>
                </div>
            </div>
        </div>
    );

    // Render via portal so z-index stacking is always correct
    if (typeof document === 'undefined') return null;
    return createPortal(modal, document.body);
}

export default ConfirmModal;
