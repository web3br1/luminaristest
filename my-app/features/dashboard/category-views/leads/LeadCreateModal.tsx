'use client';

import React from 'react';
import { Modal } from '@/components/ui/Modal';
import DynamicForm from '../../components/forms/DynamicForm';

interface LeadCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  tableId: string;
  tableSchema: any;
  selectedUnitId?: string | null;
  onSuccess?: () => void;
}

import { useTranslation } from 'next-i18next';
import { DynamicTableService } from '../../../../lib/services/dynamic-table.service';

export default function LeadCreateModal({ isOpen, onClose, tableId, tableSchema, selectedUnitId, onSuccess }: LeadCreateModalProps) {
  const { t } = useTranslation(['common', 'database']);
  if (!isOpen) return null;

  async function handleSubmit(formData: Record<string, any>) {
    try {
      if (selectedUnitId) (formData as any).unitId = selectedUnitId;
      await DynamicTableService.createRecord(tableId, { data: formData });
      onClose();
      onSuccess && onSuccess();
      return true;
    } catch (e: any) {
      // Erro já notificado automaticamente pelo apiClient.
      return false;
    }
  }

  const initial: Record<string, any> = {};
  if (selectedUnitId) initial.unitId = selectedUnitId;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={t('new_lead', 'Novo Lead')} maxWidth="max-w-3xl">
      <div className="p-4">
        <DynamicForm schema={{ ...tableSchema, fields: (tableSchema.fields || []).filter((f: any) => !['unitId', 'pipelineId', 'stageId', 'status', 'score', 'latestProposalAmount', 'latestProposalCurrency', 'latestProposalEtaClose', 'latestProposalWinProbability', 'lastContactAt', 'nextActionAt'].includes(f.name)).map((f: any) => (f.name === 'bantBudget' ? { ...f, type: 'select', options: ['Low', 'Medium', 'High'] } : f)) }} onSubmit={handleSubmit as any} onClose={onClose} initialData={initial} />
      </div>
    </Modal>
  );
}


