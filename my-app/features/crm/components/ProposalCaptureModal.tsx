import React, { useEffect, useState } from 'react';
import { useTranslation } from 'next-i18next';
import { Modal } from '../../../components/ui/Modal';
import { DEFAULT_CURRENCY } from '../lib/constants';
import type { ProposalCapture } from '../hooks/useCrmPipelineBoard';

type Currency = 'BRL' | 'USD' | 'EUR';
const CURRENCIES: Currency[] = ['BRL', 'USD', 'EUR'];

interface ProposalCaptureModalProps {
  isOpen: boolean;
  stageName: string;
  onCancel: () => void;
  onConfirm: (capture: ProposalCapture) => void | Promise<void>;
}

/**
 * Captures the proposal fields (amount, optional currency / win probability)
 * BEFORE running the transition into a `proposal` stage. Cancel rolls back the
 * optimistic move (handled by the board hook).
 */
export function ProposalCaptureModal({ isOpen, stageName, onCancel, onConfirm }: ProposalCaptureModalProps) {
  const { t } = useTranslation('crm');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<Currency>(DEFAULT_CURRENCY as Currency);
  const [winProbability, setWinProbability] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Reset the form each time the modal (re)opens.
  useEffect(() => {
    if (isOpen) {
      setAmount('');
      setCurrency(DEFAULT_CURRENCY as Currency);
      setWinProbability('');
      setSubmitting(false);
    }
  }, [isOpen]);

  const amountValue = Number(amount);
  const isValid = amount.trim() !== '' && Number.isFinite(amountValue) && amountValue > 0;

  const handleConfirm = async () => {
    if (!isValid || submitting) return;
    setSubmitting(true);
    const prob = winProbability.trim() === '' ? undefined : Number(winProbability);
    await onConfirm({
      amount: amountValue,
      currency,
      winProbability: prob !== undefined && Number.isFinite(prob) ? prob : undefined,
    });
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onCancel}
      title={t('capture.title', 'Registrar Proposta')}
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
        <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">
          {t('capture.subtitle', 'Informe os dados da proposta para mover o lead para')}{' '}
          <span className="font-black text-gray-700 dark:text-gray-200">{stageName}</span>.
        </p>

        <div>
          <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-gray-400">
            {t('capture.amount', 'Valor')}
          </label>
          <input
            type="number"
            min={0}
            step="0.01"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            autoFocus
            className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-bold text-gray-800 outline-none focus:border-blue-400 dark:border-white/10 dark:bg-neutral-800 dark:text-gray-200"
            placeholder="0,00"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-gray-400">
              {t('capture.currency', 'Moeda')}
            </label>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value as Currency)}
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-bold text-gray-800 outline-none focus:border-blue-400 dark:border-white/10 dark:bg-neutral-800 dark:text-gray-200"
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-black uppercase tracking-widest text-gray-400">
              {t('capture.win_probability', 'Win %')}
            </label>
            <input
              type="number"
              min={0}
              max={100}
              value={winProbability}
              onChange={(e) => setWinProbability(e.target.value)}
              className="w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-bold text-gray-800 outline-none focus:border-blue-400 dark:border-white/10 dark:bg-neutral-800 dark:text-gray-200"
              placeholder="0–100"
            />
          </div>
        </div>
      </div>
    </Modal>
  );
}

export default ProposalCaptureModal;
