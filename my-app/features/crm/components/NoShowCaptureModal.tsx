import React, { useEffect, useState } from 'react';
import { useTranslation } from 'next-i18next';
import { Modal } from '../../../components/ui/Modal';

interface NoShowCaptureModalProps {
  isOpen: boolean;
  canRevert: boolean;
  onCancel: () => void;
  onConfirm: (capture: { option: 'reschedule' | 'revert'; rescheduleAt?: string }) => void | Promise<void>;
}

/**
 * Captures the no-show resolution (reschedule the meeting or revert to the
 * previous stage) BEFORE calling CrmService.recordNoShow. Mirrors the
 * ProposalCaptureModal pattern (isOpen-reset, submitting guard, Cancel/Confirm
 * footer). The `reschedule` option requires a full ISO-8601 datetime, so the raw
 * <input type="datetime-local"> value is converted via toISOString() on confirm.
 */
export function NoShowCaptureModal({ isOpen, canRevert, onCancel, onConfirm }: NoShowCaptureModalProps) {
  const { t } = useTranslation('crm');
  const [option, setOption] = useState<'reschedule' | 'revert'>('reschedule');
  const [newDate, setNewDate] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Reset the form each time the modal (re)opens.
  useEffect(() => {
    if (isOpen) {
      setOption('reschedule');
      setNewDate('');
      setSubmitting(false);
    }
  }, [isOpen]);

  const isValid = option === 'revert' ? canRevert : newDate.trim() !== '';

  const handleConfirm = async () => {
    if (!isValid || submitting) return;
    setSubmitting(true);
    if (option === 'reschedule') {
      await onConfirm({ option: 'reschedule', rescheduleAt: new Date(newDate).toISOString() });
    } else {
      await onConfirm({ option: 'revert' });
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onCancel}
      title={t('noshow.title', 'Registrar falta na reunião')}
      maxWidth="max-w-md"
      footer={
        <>
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-bold text-gray-700 transition hover:bg-gray-100 dark:border-white/10 dark:text-gray-200 dark:hover:bg-neutral-800"
          >
            {t('capture.cancel', 'Cancelar')}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!isValid || submitting}
            className="rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 px-4 py-2 text-sm font-black text-white shadow-lg shadow-blue-500/20 transition hover:from-blue-700 hover:to-indigo-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {t('capture.confirm', 'Confirmar')}
          </button>
        </>
      }
    >
      <div className="space-y-4 p-5">
        <div className="space-y-2">
          <span className="block text-[10px] font-black uppercase tracking-widest text-gray-400">
            {t('noshow.prompt', 'Como deseja proceder?')}
          </span>
          <div className="flex flex-col gap-2 text-sm font-bold text-gray-800 dark:text-gray-200">
            <label className="inline-flex items-center gap-2">
              <input
                type="radio"
                name="noshow-option"
                checked={option === 'reschedule'}
                onChange={() => setOption('reschedule')}
              />
              <span>{t('noshow.reschedule', 'Reagendar')}</span>
            </label>
            {canRevert && (
              <label className="inline-flex items-center gap-2">
                <input
                  type="radio"
                  name="noshow-option"
                  checked={option === 'revert'}
                  onChange={() => setOption('revert')}
                />
                <span>{t('noshow.revert', 'Voltar para etapa anterior')}</span>
              </label>
            )}
          </div>
        </div>

        {option === 'reschedule' && (
          <div>
            <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-gray-400">
              {t('noshow.new_date', 'Nova data da reunião')}
            </label>
            <input
              type="datetime-local"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-bold text-gray-800 outline-none focus:border-blue-400 dark:border-white/10 dark:bg-neutral-800 dark:text-gray-200 dark:[color-scheme:dark]"
            />
          </div>
        )}
      </div>
    </Modal>
  );
}

export default NoShowCaptureModal;
