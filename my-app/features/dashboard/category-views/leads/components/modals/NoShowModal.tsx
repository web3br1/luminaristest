'use client';

import React from 'react';
import { Modal as UiModal } from '../../../../../../components/ui/Modal';

interface NoShowModalProps {
  isOpen: boolean;
  option: 'reschedule'|'back';
  setOption: (v: 'reschedule'|'back') => void;
  newDate: string;
  setNewDate: (v: string) => void;
  onCancel: () => void;
  onConfirmReschedule: () => void;
  onConfirmBack: () => void;
}

export default function NoShowModal({ isOpen, option, setOption, newDate, setNewDate, onCancel, onConfirmReschedule, onConfirmBack }: NoShowModalProps) {
  if (!isOpen) return null;
  return (
    <UiModal isOpen onClose={onCancel} title="Registrar falta na reunião" maxWidth="max-w-lg" footer={(
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="px-3 py-2 rounded-md bg-gray-100 hover:bg-gray-200 dark:bg-neutral-800 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200">Cancelar</button>
        {option==='reschedule' ? (
          <button disabled={!newDate} onClick={onConfirmReschedule} className={`px-3 py-2 rounded-md ${!newDate?'bg-blue-300 dark:bg-blue-700/60':'bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500'} text-white`}>Salvar</button>
        ) : (
          <button onClick={onConfirmBack} className="px-3 py-2 rounded-md bg-rose-600 hover:bg-rose-700 text-white">Voltar etapa</button>
        )}
      </div>
    )}>
      <div className="p-4 space-y-4 bg-white dark:bg-neutral-900 rounded-lg">
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-800 dark:text-gray-100">Como deseja proceder?</label>
          <div className="flex items-center gap-4 text-sm">
            <label className="inline-flex items-center gap-2">
              <input type="radio" name="nsopt" checked={option==='reschedule'} onChange={()=>setOption('reschedule')} />
              <span>Reagendar</span>
            </label>
            <label className="inline-flex items-center gap-2">
              <input type="radio" name="nsopt" checked={option==='back'} onChange={()=>setOption('back')} />
              <span>Voltar para etapa anterior</span>
            </label>
          </div>
        </div>
        {option==='reschedule' && (
          <div className="space-y-1">
            <label className="block text-sm text-gray-700 dark:text-gray-200">Nova data da reunião</label>
            <input type="datetime-local" value={newDate} onChange={(e)=>setNewDate(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-neutral-800 border border-gray-200 dark:border-gray-700 text-sm text-gray-900 dark:text-gray-100 dark:[color-scheme:dark]" />
          </div>
        )}
      </div>
    </UiModal>
  );
}


