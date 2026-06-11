'use client';

import React, { useState, useCallback } from 'react';
import { useTranslation } from 'next-i18next';
import type { ITableSchema, IDynamicTableData } from '../shared/dynamic-tables.client';
import { DynamicTableService } from '../../../../lib/services/dynamic-table.service';
import { Modal } from '@/components/ui/Modal';
import DynamicForm from '../forms/DynamicForm';

/**
 * Shape of API error responses surfaced by DynamicTableService.
 * Backend may return `details` (field-level errors), `code` (machine-readable),
 * or just a plain `message` / `error` string. All fields are optional.
 */
interface ApiErrorShape {
  message?: string;
  error?: string;
  code?: string;
  details?: Record<string, string>;
}

interface EditRecordButtonProps {
  tableId: string;
  tableSchema: ITableSchema;
  record: IDynamicTableData;
  onSuccess: () => void;
  className?: string;
  tableName?: string;
  tableInternalName?: string;
}

function EditRecordButton({ tableId, tableSchema, record, onSuccess, className = '', tableName, tableInternalName }: EditRecordButtonProps) {
  const { t } = useTranslation(['common', 'database']);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDirty, setIsDirty] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const getInitialData = useCallback((): Record<string, unknown> => {
    const initialData: Record<string, unknown> = typeof record.data === 'object' && record.data !== null && !Array.isArray(record.data)
      ? { ...record.data }
      : {};

    tableSchema.fields.forEach(field => {
      const rawValue = initialData[field.name];
      if (field.type === 'date' && rawValue) {
        try {
          initialData[field.name] = new Date(String(rawValue)).toISOString().split('T')[0];
        } catch (e) {
          console.error(`Error formatting date for field ${field.name}:`, e);
        }
      }
    });

    return initialData;
  }, [record.data, tableSchema.fields]);

  const handleCloseModal = useCallback(() => {
    setIsModalOpen(false);
  }, []);

  const handleOpenModal = useCallback((event: React.MouseEvent) => {
    event.stopPropagation();
    setFormError(null);
    setFieldErrors({});
    setIsModalOpen(true);
  }, []);

  const handleUpdateRecord = useCallback(async (formData: Record<string, unknown>) => {
    try {
      await DynamicTableService.updateRecord(tableId, record.id, { data: formData });
      onSuccess();
      handleCloseModal();
      return true;
    } catch (err: unknown) {
      const errorData = (err ?? {}) as ApiErrorShape;
      if (errorData.details) {
        setFieldErrors(errorData.details);
        setFormError(errorData.message || t('invalid_data', 'Invalid data.'));
        return false;
      }
      const code = String(errorData.code || '').toUpperCase();
      const msg = String(errorData.message || errorData.error || t('failed_to_update_record', 'Failed to update record.'));
      if (code === 'VALIDATION_ERROR') {
        setFormError(msg);
        return false;
      }
      if (/unique|já existe/i.test(msg)) {
        setFormError(t('duplicate_value_error', 'Duplicate value: a record with one of the provided values already exists.'));
        return false;
      }
      setFormError(msg);
      return false;
    }
  }, [tableId, record.id, onSuccess, t]);

  const handleDirtyChange = useCallback(() => setIsDirty(true), []);

  return (
    <>
      <button
        onClick={handleOpenModal}
        className={`p-2 rounded-full hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors ${className}`}
        aria-label={t('edit_record_aria', 'Edit record')}
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-gray-500 dark:text-gray-400" viewBox="0 0 20 20" fill="currentColor">
          <path d="M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828z" />
          <path fillRule="evenodd" d="M2 6a2 2 0 012-2h4a1 1 0 010 2H4v10h10v-4a1 1 0 112 0v4a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" clipRule="evenodd" />
        </svg>
      </button>

      {isModalOpen && (
        <Modal
          isOpen={isModalOpen}
          onClose={handleCloseModal}
          title={t('edit_record_title', {
            defaultValue: `Edit ${String(t(`database:tables.${tableInternalName}`, tableName || 'Record') || tableName || 'Record')}`,
            table: t(`database:tables.${tableInternalName}`, tableName || 'Record') || tableName || 'Record'
          })}
          maxWidth="max-w-2xl"
          isDirty={isDirty}
          themeColor={(() => {
            // Heuristic theme by table name — matches both PT ("produto") and EN ("product") variants.
            const n = String(tableName || '').toLowerCase();
            return (n.includes('produto') || n.includes('product')) ? 'bg-blue-600' : 'bg-indigo-600';
          })()}
        >
          <div className="p-5">
            {formError && (
              <div className="mb-4 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 px-3 py-2 text-sm">
                {formError}
              </div>
            )}
            <DynamicForm
              schema={tableSchema}
              onSubmit={handleUpdateRecord}
              onClose={handleCloseModal}
              onChange={handleDirtyChange}
              initialData={getInitialData()}
              formError={formError}
              fieldErrors={fieldErrors}
            />
          </div>
        </Modal>
      )}
    </>
  );
}

export default EditRecordButton;
