'use client';

import React from 'react';
import { Modal } from '@/components/ui/Modal';
import DynamicForm from '../../components/forms/DynamicForm';
import type { ITableSchema, ISchemaField } from '@/features/dashboard/components/shared/dynamic-tables.client';

interface LeadCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  tableId: string;
  tableSchema: ITableSchema;
  selectedUnitId?: string | null;
  onSuccess?: () => void;
}

import { useTranslation } from 'next-i18next';
import { DynamicTableService } from '../../../../lib/services/dynamic-table.service';

export default function LeadCreateModal({ isOpen, onClose, tableId, tableSchema, selectedUnitId, onSuccess }: LeadCreateModalProps) {
  const { t } = useTranslation(['common', 'database']);
  if (!isOpen) return null;

  async function handleSubmit(rawFormData: Record<string, unknown>) {
    try {
      let formData = rawFormData;
      if (selectedUnitId) formData = { ...formData, unitId: selectedUnitId };
      await DynamicTableService.createRecord(tableId, { data: formData });
      onClose();
      onSuccess && onSuccess();
      return true;
    } catch (_e) {
      // Erro já notificado automaticamente pelo apiClient.
      return false;
    }
  }

  const initial: Record<string, unknown> = {};
  if (selectedUnitId) initial.unitId = selectedUnitId;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('new_lead', 'Novo Lead')} maxWidth="max-w-3xl">
      <div className="p-4">
        <DynamicForm schema={{ ...tableSchema, fields: (tableSchema.fields || []).filter((f: ISchemaField) => !['unitId', 'pipelineId', 'stageId', 'status', 'score', 'latestProposalAmount', 'latestProposalCurrency', 'latestProposalEtaClose', 'latestProposalWinProbability', 'lastContactAt', 'nextActionAt'].includes(f.name)).map((f: ISchemaField) => (f.name === 'bantBudget' ? { ...f, type: 'select', options: ['Low', 'Medium', 'High'] } : f)) }} onSubmit={handleSubmit} onClose={onClose} initialData={initial} />
      </div>
    </Modal>
  );
}


