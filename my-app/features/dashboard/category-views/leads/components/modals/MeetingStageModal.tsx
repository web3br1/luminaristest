'use client';

import React from 'react';
import { Modal as UiModal } from '../../../../../../components/ui/Modal';

interface MeetingStageModalProps {
  isOpen: boolean;
  meetingAt: string;
  setMeetingAt: (v: string) => void;
  saving: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export default function MeetingStageModal({ isOpen, meetingAt, setMeetingAt, saving, onCancel, onConfirm }: MeetingStageModalProps) {
  if (!isOpen) return null;
  return (
    <UiModal isOpen onClose={onCancel} title="Agendar reunião" maxWidth="max-w-lg" footer={(
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="px-3 py-2 rounded-md bg-gray-100 hover:bg-gray-200 dark:bg-neutral-800 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200">Cancelar</button>
        <button disabled={!meetingAt || saving} onClick={onConfirm} className={`px-3 py-2 rounded-md ${!meetingAt||saving?'bg-blue-300 dark:bg-blue-700/60':'bg-blue-600 hover:bg-blue-700 dark:bg-blue-600 dark:hover:bg-blue-500'} text-white`}>{saving?'Salvando...':'Avançar'}</button>
      </div>
    )}>
      <div className="p-4 space-y-4 bg-white dark:bg-neutral-900 rounded-lg">
        <div className="space-y-1">
          <label className="block text-sm font-medium text-gray-800 dark:text-gray-100">Data e horário</label>
          <input type="datetime-local" value={meetingAt} onChange={(e)=>setMeetingAt(e.target.value)} className="w-full px-3 py-2 rounded-lg bg-gray-50 dark:bg-neutral-800 border border-gray-200 dark:border-gray-700 text-sm text-gray-900 dark:text-gray-100 dark:[color-scheme:dark] focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
        </div>
        <p className="text-xs text-gray-500 dark:text-gray-400">Informe quando será a reunião para avançar para "Reunião Agendada".</p>
      </div>
    </UiModal>
  );
}


