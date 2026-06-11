'use client';

import React from 'react';
import { Modal as UiModal } from '../../../../../../components/ui/Modal';

interface ProposalStageModalProps {
  isOpen: boolean;
  amountInput: string;
  setAmountInput: (v: string) => void;
  setAmountValue: (v: number | null) => void;
  currency: string;
  setCurrency: (v: string) => void;
  winProb: string;
  setWinProb: (v: string) => void;
  saving: boolean;
  canConfirm: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export default function ProposalStageModal(props: ProposalStageModalProps) {
  const { isOpen, amountInput, setAmountInput, setAmountValue, currency, setCurrency, winProb, setWinProb, saving, canConfirm, onCancel, onConfirm } = props;
  if (!isOpen) return null;
  return (
    <UiModal isOpen onClose={onCancel} title="Registrar proposta" maxWidth="max-w-lg" footer={(
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="px-3 py-2 rounded-md bg-gray-100 hover:bg-gray-200 dark:bg-neutral-800 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200">Cancelar</button>
        <button disabled={!canConfirm || saving} onClick={onConfirm} className={`px-3 py-2 rounded-md ${!canConfirm||saving?'bg-blue-300 dark:bg-blue-700/60':'bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500'} text-white`}>{saving?'Salvando...':'Avançar'}</button>
      </div>
    )}>
      <div className="p-4 space-y-4 bg-white dark:bg-neutral-900 rounded-lg">
        <div>
          <label className="block text-sm font-medium text-gray-800 dark:text-gray-100">Valor negociado</label>
          <input
            type="text"
            inputMode="numeric"
            value={amountInput}
            onChange={(e)=>{
              const digits = (e.target.value || '').replace(/\D/g, '');
              const cents = digits ? Number(digits) : 0;
              const val = cents / 100;
              setAmountValue(Number.isFinite(val) ? val : null);
              const display = (Number.isFinite(val) ? val : 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
              setAmountInput(display);
            }}
            placeholder="0,00"
            className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-neutral-800 border border-gray-200 dark:border-gray-700 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-right"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-800 dark:text-gray-100">Moeda</label>
          <select value={currency} onChange={(e)=>setCurrency(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-neutral-800 border border-gray-200 dark:border-gray-700 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500">
            <option>BRL</option><option>USD</option><option>EUR</option>
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-800 dark:text-gray-100">Probabilidade (%)</label>
          <div className="relative">
            <input
              type="number"
              min="0"
              max="100"
              step="1"
              value={winProb}
              onChange={(e)=>setWinProb(e.target.value)}
              className="w-full pr-8 px-3 py-2 rounded-lg bg-gray-50 dark:bg-neutral-800 border border-gray-200 dark:border-gray-700 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-gray-500 dark:text-gray-400">%</span>
          </div>
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400">Os dados serão registrados e você avançará para "Proposta Enviada".</p>
      </div>
    </UiModal>
  );
}


