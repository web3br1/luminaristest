'use client';

/**
 * ConfirmDeleteModal — Thin wrapper around ConfirmModal with inactivation defaults.
 *
 * Preserved for backward compatibility across all existing usages in the system.
 * New code should import ConfirmModal directly and choose the appropriate variant.
 */

import React from 'react';
import { useTranslation } from 'next-i18next';
import { ConfirmModal } from '@/components/ui/feedback/ConfirmModal';

interface ConfirmDeleteModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    title?: string;
    message?: string;
    /** @deprecated Use isLoading instead */
    isDeleting?: boolean;
    isLoading?: boolean;
    error?: string | null;
}

export function ConfirmDeleteModal({
    isOpen,
    onClose,
    onConfirm,
    title,
    message,
    isDeleting,
    isLoading,
    error = null,
}: ConfirmDeleteModalProps) {
    const { t } = useTranslation(['common']);

    const defaultTitle = t('delete_confirmation_title', 'Confirm Inactivation?');
    const defaultMessage = t(
        'delete_confirmation_message',
        'Are you sure you want to inactivate this record? It will no longer appear in the system for new registrations or interactions, but will remain in financial reports and history for audit purposes.'
    );

    return (
        <ConfirmModal
            isOpen={isOpen}
            onClose={onClose}
            onConfirm={onConfirm}
            variant="danger"
            title={title ?? defaultTitle}
            message={message ?? defaultMessage}
            confirmLabel={t('confirm_inactivate', 'Yes, Inactivate')}
            cancelLabel={t('cancel', 'Cancel')}
            isLoading={isLoading ?? isDeleting ?? false}
            error={error}
        />
    );
}

export default ConfirmDeleteModal;
