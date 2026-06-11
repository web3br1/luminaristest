'use client';

import React, { useEffect, useRef } from 'react';
import { WizardTabBar, WizardTab } from './WizardTabBar';

// =============================================================================
// TYPES
// =============================================================================

interface WizardModalProps {
    isOpen: boolean;
    onClose: () => void;
    title: string;
    tabs: WizardTab[];
    activeTab: string;
    onTabChange: (tabId: string) => void;
    children: React.ReactNode;
    footer?: React.ReactNode;
    maxWidth?: string;
    showCloseButton?: boolean;
    /** Error message to display at the top */
    error?: string | null;
    /** Whether the modal is in a loading/submitting state */
    submitting?: boolean;
}

// =============================================================================
// WIZARD MODAL COMPONENT
// =============================================================================

/**
 * A modal component designed for multi-step wizard forms.
 * Features a tab-based navigation system at the top for easy step switching.
 * 
 * @example
 * ```tsx
 * const tabs = [
 *   { id: 'info', label: 'Informações' },
 *   { id: 'items', label: 'Itens', badge: items.length },
 *   { id: 'payment', label: 'Pagamento' },
 *   { id: 'summary', label: 'Resumo' },
 * ];
 * 
 * <WizardModal
 *   isOpen={isOpen}
 *   onClose={handleClose}
 *   title="Nova Venda"
 *   tabs={tabs}
 *   activeTab={activeTab}
 *   onTabChange={setActiveTab}
 *   footer={<FooterButtons />}
 * >
 *   {activeTab === 'info' && <InfoStep />}
 *   {activeTab === 'items' && <ItemsStep />}
 * </WizardModal>
 * ```
 */
export function WizardModal({
    isOpen,
    onClose,
    title,
    tabs,
    activeTab,
    onTabChange,
    children,
    footer,
    maxWidth = 'max-w-4xl',
    showCloseButton = true,
    error,
    submitting = false,
}: WizardModalProps) {
    const modalRef = useRef<HTMLDivElement>(null);

    // Handle click outside and escape key
    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (!submitting && modalRef.current && !modalRef.current.contains(event.target as Node)) {
                onClose();
            }
        }

        function handleEscapeKey(event: KeyboardEvent) {
            if (!submitting && event.key === 'Escape') {
                onClose();
            }
        }

        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
            document.addEventListener('keydown', handleEscapeKey);
            document.body.style.overflow = 'hidden';
        }

        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleEscapeKey);
            document.body.style.overflow = 'unset';
        };
    }, [isOpen, onClose, submitting]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div
                ref={modalRef}
                className={`bg-white dark:bg-neutral-900 rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.3)] w-full ${maxWidth} max-h-[90vh] flex flex-col border border-gray-200/50 dark:border-gray-800 relative overflow-hidden`}
            >
                {/* Decorative Top Bar */}
                <div className="h-1.5 w-full bg-gradient-to-r from-blue-600 via-blue-500 to-blue-600" />

                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800 bg-white/50 dark:bg-neutral-900/50 backdrop-blur-md">
                    <h3 className="text-xl font-bold text-gray-900 dark:text-white tracking-tight">
                        {title}
                    </h3>
                    {showCloseButton && (
                        <button
                            onClick={onClose}
                            disabled={submitting}
                            className="text-gray-400 hover:text-gray-600 dark:text-gray-400 dark:hover:text-gray-200 transition-colors disabled:opacity-50"
                            aria-label="Fechar modal"
                        >
                            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </button>
                    )}
                </div>

                {/* Tab Navigation */}
                <WizardTabBar
                    tabs={tabs}
                    activeTab={activeTab}
                    onTabChange={onTabChange}
                    className="px-4"
                />

                {/* Error Message */}
                {error && (
                    <div className="mx-6 mt-4 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 px-4 py-3 text-sm flex items-center gap-2">
                        <svg className="w-5 h-5 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
                        </svg>
                        {error}
                    </div>
                )}

                {/* Content Area */}
                <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
                    {children}
                </div>

                {/* Footer */}
                {footer && (
                    <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50/50 dark:bg-neutral-900/50">
                        {footer}
                    </div>
                )}
            </div>
        </div>
    );
}

export default WizardModal;
