'use client';

import React from 'react';
import { Modal as UiModal } from '../../../../../../components/ui/Modal';

interface DeleteLeadModalsProps {
  step: 0 | 1 | 2;
  onClose: () => void;
  onContinue: () => void;
  onConfirmDelete: () => void;
  confirmText: string;
  setConfirmText: (v: string) => void;
  leadName: string;
}

import { useTranslation } from 'next-i18next';

export default function DeleteLeadModals({ step, onClose, onContinue, onConfirmDelete, confirmText, setConfirmText, leadName }: DeleteLeadModalsProps) {
  const { t } = useTranslation(['common', 'database']);
  if (step === 0) return null;
  if (step === 1) {
    return (
      <UiModal isOpen onClose={onClose} title={t('delete_lead', 'Excluir lead')} maxWidth="max-w-lg" footer={(
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-2 rounded-md bg-gray-100 hover:bg-gray-200 dark:bg-neutral-800 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200">{t('cancel', 'Cancelar')}</button>
          <button onClick={onContinue} className="px-3 py-2 rounded-md bg-rose-600 hover:bg-rose-700 text-white">{t('continue', 'Continuar')}</button>
        </div>
      )}>
        <div className="p-4 space-y-3">
          <p className="text-sm text-gray-700 dark:text-gray-200">{t('delete_lead_warning', 'Esta ação irá remover definitivamente o lead e todos os dados relacionados (atividades e propostas). Você terá que confirmar novamente.')}</p>
        </div>
      </UiModal>
    );
  }
  return (
    <UiModal isOpen onClose={onClose} title={t('confirm_deletion', 'Confirmar exclusão')} maxWidth="max-w-lg" footer={(
      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="px-3 py-2 rounded-md bg-gray-100 hover:bg-gray-200 dark:bg-neutral-800 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200">{t('cancel', 'Cancelar')}</button>
        <button disabled={confirmText !== leadName} onClick={onConfirmDelete} className={`px-3 py-2 rounded-md ${confirmText === leadName ? 'bg-rose-600 hover:bg-rose-700 text-white' : 'bg-rose-300 text-white'}`}>{t('confirm_delete_button', 'Excluir definitivamente')}</button>
      </div>
    )}>
      <div className="p-4 space-y-4">
        <p className="text-sm text-gray-700 dark:text-gray-200">{t('type_lead_name_to_confirm', 'Para confirmar, digite o nome do lead exatamente como aparece:')}</p>
        <p className="text-sm font-semibold text-gray-900 dark:text-gray-100">{leadName}</p>
        <input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-neutral-800 border border-gray-200 dark:border-gray-700 text-sm" placeholder={t('type_lead_name_placeholder', 'Digite o nome do lead')} />
      </div>
    </UiModal>
  );
}


