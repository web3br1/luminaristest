'use client';

import React, { useRef, useEffect } from 'react';
import { ChatInstanceSummary } from '../types/chat.types';

interface ChatHeaderProps {
  chatTitle: string;
  onClose?: () => void;

  // Props from useChatInstances
  isDropdownOpen: boolean;
  toggleDropdown: () => void;
  instances: ChatInstanceSummary[];
  onSelectInstance: (widgetInstanceId: string) => void;
  onInitiateNewChat: () => void;
  instanceIdPendingDelete: string | null;
  isDeletingInstance: boolean;
  deleteInstanceError: string | null;
  requestDeleteConfirmation: (id: string) => void;
  cancelDeleteConfirmation: () => void;
  confirmDeleteInstance: (id: string) => Promise<void>;
  isLoadingInstances: boolean;
  loadInstancesError: string | null;
}

export function ChatHeader(props: ChatHeaderProps) {
  const {
    chatTitle,
    onClose,
    isDropdownOpen,
    toggleDropdown,
    instances,
    onSelectInstance,
    onInitiateNewChat,
    instanceIdPendingDelete,
    isDeletingInstance,
    deleteInstanceError,
    requestDeleteConfirmation,
    cancelDeleteConfirmation,
    confirmDeleteInstance,
    isLoadingInstances,
    loadInstancesError
  } = props;

  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        if (isDropdownOpen) {
          toggleDropdown();
        }
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isDropdownOpen, toggleDropdown]);

  return (
    <div className="flex items-center justify-between px-3 py-2.5 bg-gray-50/50 dark:bg-neutral-800/30 border-b border-gray-200 dark:border-gray-800 cursor-move drag-handle group select-none">
      <div className="relative flex items-center flex-grow min-w-0" ref={dropdownRef}>
        <div className="flex items-center cursor-pointer" onClick={toggleDropdown}>
          <h3
            className="font-semibold text-xs tracking-wide uppercase text-gray-700 dark:text-gray-300 truncate pr-2"
            title={chatTitle}
          >
            {chatTitle}
          </h3>
          <svg xmlns="http://www.w3.org/2000/svg" className={`h-4 w-4 text-gray-400 dark:text-gray-500 transform transition-transform duration-150 ${isDropdownOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>

        {isDropdownOpen && (
          <div className="absolute top-full left-0 mt-2 w-72 bg-white dark:bg-neutral-900 border border-gray-200 dark:border-gray-800 rounded-lg shadow-lg z-20 p-2 text-gray-900 dark:text-white">
            <button onClick={onInitiateNewChat} className="block w-full text-left px-3 py-2 mb-2 text-sm font-medium rounded hover:bg-gray-100 dark:hover:bg-neutral-800 border border-transparent hover:border-gray-300 dark:hover:border-gray-700 transition">+ Nova Conversa</button>
            {(loadInstancesError || deleteInstanceError) && <div className="mb-2 px-3 py-1 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded">{loadInstancesError || deleteInstanceError}</div>}
            {isLoadingInstances ? (
              <div className="text-center text-xs text-gray-500 dark:text-gray-400 py-2">Carregando...</div>
            ) : (
              <div className="max-h-48 overflow-y-auto custom-scrollbar">
                {instances.length === 0 && <div className="text-center text-xs text-gray-500 dark:text-gray-400 py-2">Nenhuma conversa disponível.</div>}
                {instances.map(inst => {
                  const isPending = inst.id === instanceIdPendingDelete;
                  return (
                    <div key={inst.id} className="flex items-center justify-between px-3 py-2 rounded hover:bg-gray-50 dark:hover:bg-neutral-800/50 group transition">
                      <button onClick={() => onSelectInstance(inst.widgetInstanceId)} className="flex-grow text-sm text-left truncate text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white" title={inst.title || `Conversa`}>
                        {inst.title || `Conversa sem título`}
                      </button>
                      {!isPending ? (
                        <button onClick={() => requestDeleteConfirmation(inst.id)} className="p-1.5 ml-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 opacity-0 group-hover:opacity-100 transition-all" aria-label="Deletar conversa">
                          <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19 5v14H5V5h14zM9 5v-2a1 1 0 011-1h4a1 1 0 011 1v2M10 9v8m4-8v8" /></svg>
                        </button>
                      ) : (
                        <div className="flex items-center space-x-1 pl-2">
                          {isDeletingInstance && <div className="w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>}
                          {!isDeletingInstance && (
                            <>
                              <button onClick={() => confirmDeleteInstance(inst.id)} className="px-2 py-1 text-xs text-white bg-red-500 rounded hover:bg-red-600 transition">Excluir</button>
                              <button onClick={cancelDeleteConfirmation} className="px-2 py-1 text-xs bg-gray-100 dark:bg-neutral-800 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-200 dark:hover:bg-neutral-700 transition">Cancel</button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {onClose && (
        <button
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className="widget-action-btn p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors opacity-0 group-hover:opacity-100 transition-all focus:outline-none"
          title="Fechar"
          aria-label="Close chat widget"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
} 