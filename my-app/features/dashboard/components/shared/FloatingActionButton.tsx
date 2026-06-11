import React, { ReactNode, useState, useCallback } from 'react';
import { useTranslation } from 'next-i18next';
import dynamic from 'next/dynamic';
import { DynamicTableService } from '../../../../lib/services/dynamic-table.service';
import { notify } from '@/lib/notifications/notify';
import type { ITableSchema } from './dynamic-tables.client';

// Dynamic import for performance optimization
const DynamicForm = dynamic(
  () => import('@/features/dashboard/components/forms/DynamicForm'),
  { ssr: false }
);

import { Modal } from '@/components/ui/Modal';

/**
 * Shape of API error responses surfaced by DynamicTableService.
 * Backend may return `details` (field-level errors), `code`, or just `message`/`error`.
 */
interface ApiErrorShape {
  message?: string;
  error?: string;
  code?: string;
  details?: Record<string, string | string[]>;
}

interface FloatingActionButtonProps {
  /** Button text or content */
  children: ReactNode;
  /** The ID of the table to create records in */
  tableId?: string;
  /** The schema for the dynamic form */
  tableSchema?: ITableSchema;
  /** Function to call on successful creation */
  onSuccess?: () => void;
  /** Title for the creation modal */
  modalTitle?: string;
  /** Custom theme color for the modal header (e.g., 'bg-blue-600') */
  themeColor?: string;
  /** Additional CSS classes */
  className?: string;
  /** If true, renders as a simple button without modal functionality */
  simpleButton?: boolean;
  /** Click handler for simple button mode */
  onClick?: () => void;
}

export function FloatingActionButton({
  children,
  tableId,
  tableSchema,
  onSuccess,
  modalTitle,
  themeColor,
  className = '',
  simpleButton = false,
  onClick
}: FloatingActionButtonProps) {
  const { t } = useTranslation(['common', 'database']);
  const finalModalTitle = modalTitle || t('common:new_record', 'Add New Record');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const handleCloseModal = useCallback(() => {
    setIsModalOpen(false);
    setIsDirty(false);
  }, []);

  const handleButtonClick = useCallback(() => {
    if (simpleButton && onClick) {
      onClick();
    } else if (!simpleButton) {
      setIsDirty(false);
      setIsModalOpen(true);
    }
  }, [simpleButton, onClick]);

  const handleDirtyChange = useCallback(() => setIsDirty(true), []);

  const handleSubmit = useCallback(async (formData: Record<string, unknown>) => {
    setIsSubmitting(true);
    setError(null);
    setFieldErrors({});

    if (!tableId) {
      console.error('[FloatingActionButton] Error: tableId is missing!');
      notify(t('common:table_not_found', 'Table not found'), 'error');
      setIsSubmitting(false);
      return false;
    }

    try {
      await DynamicTableService.createRecord(tableId, { data: formData });
      setIsModalOpen(false);
      if (onSuccess) onSuccess();
      return true;
    } catch (err: unknown) {
      const responseData = (err ?? {}) as ApiErrorShape;
      if (responseData.details && typeof responseData.details === 'object') {
        const errors: Record<string, string> = {};
        Object.entries(responseData.details).forEach(([field, messages]) => {
          errors[field] = Array.isArray(messages) ? messages.join(', ') : String(messages);
        });
        setFieldErrors(errors);
        return false;
      }

      const msg = String(responseData.message || responseData.error || '');
      if (msg) setError(msg);

      return false;
    } finally {
      setIsSubmitting(false);
    }
  }, [tableId, onSuccess, t]);

  return (
    <>
      <button
        onClick={handleButtonClick}
        disabled={isSubmitting}
        className={`inline-flex items-center justify-center px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
      >
        <svg
          className={`h-5 w-5 mr-2 ${isSubmitting ? 'animate-spin' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          {isSubmitting ? (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          )}
        </svg>
        {isSubmitting ? (t('processing', 'Processing...') as string) : children}
      </button>

      {!simpleButton && tableSchema && (
        <Modal
          isOpen={isModalOpen}
          onClose={handleCloseModal}
          title={finalModalTitle}
          maxWidth="max-w-2xl"
          isDirty={isDirty}
          themeColor={themeColor || 'bg-blue-600'}
        >
          <div className="p-5">
            {error && (
              <div className="mb-4 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 px-3 py-2 text-sm">
                {error}
              </div>
            )}
            <DynamicForm
              schema={tableSchema}
              onSubmit={handleSubmit}
              onClose={handleCloseModal}
              onChange={handleDirtyChange}
              fieldErrors={fieldErrors}
              isSubmitting={isSubmitting}
            />
          </div>
        </Modal>
      )}
    </>
  );
}

export default FloatingActionButton;
