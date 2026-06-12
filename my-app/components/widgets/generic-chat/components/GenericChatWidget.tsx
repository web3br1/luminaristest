'use client';

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useTranslation } from 'next-i18next';
import { GenericChatWidgetProps } from '../types/generic-chat.types';
import { useChatInstance, useChatMessages, useChatInstances, type Message } from '../../shared/hooks';
import { getCookie, setCookie, deleteCookie } from 'cookies-next';
import { CommandConfirmationModal } from './CommandConfirmationModal';

const FLOATING_CHAT_WIDGET_ID = 'floating-generic-chat';
const LAST_CHAT_COOKIE = 'last_generic_chat_id';

const DEBUG = true;
function log(...args: unknown[]) {
    if (DEBUG) console.log('[GenericChatWidget]', ...args);
}

/**
 * Widget de chat genérico simplificado.
 * Usa lazy initialization para evitar race conditions.
 */
function GenericChatWidget({
    id = FLOATING_CHAT_WIDGET_ID,
    onClose,
    title = 'Chat',
    inputPlaceholder = 'Digite sua pergunta...',
    contextProvider,
}: GenericChatWidgetProps) {
    const { t } = useTranslation('common');
    const [inputValue, setInputValue] = useState('');
    const [renameValue, setRenameValue] = useState('');
    const [proposalToConfirm, setProposalToConfirm] = useState<any>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    // LAZY INITIALIZATION: lê o cookie ANTES de criar o estado
    // Isso evita a race condition de mudar o estado depois
    const [activeWidgetId, setActiveWidgetId] = useState<string>(() => {
        // Esta função só roda UMA VEZ na montagem
        const cookieId = getCookie(LAST_CHAT_COOKIE);
        const initialId = (typeof cookieId === 'string' && cookieId) ? cookieId : id;
        log('🏁 Inicialização lazy, cookieId:', cookieId, '→ usando:', initialId);
        return initialId;
    });

    // Hook de instância - usa getOrCreate endpoint
    const {
        chatInstanceId,
        chatTitle,
        messages,
        setMessages,
        isInstanceLoading,
        errorInstance,
        initializeChat,
    } = useChatInstance({
        chatType: 'GENERIC',
        currentWidgetInstanceId: activeWidgetId,
    });

    // Hook para gerenciar lista de conversas (dropdown)
    const {
        allChatInstances,
        isDropdownOpen,
        toggleDropdown,
        isLoadingInstances,
        instanceIdPendingDelete,
        isDeletingInstance,
        requestDeleteConfirmation,
        cancelDeleteConfirmation,
        confirmDeleteInstance,
        instanceIdBeingRenamed,
        isRenamingInstance,
        startRename,
        cancelRename,
        confirmRename,
        fetchInstances,
    } = useChatInstances({
        chatType: 'GENERIC',
        currentWidgetInstanceId: chatInstanceId,
        onSelectChatInstance: (widgetInstanceId) => {
            log('📂 Selecionando conversa:', widgetInstanceId);
            setActiveWidgetId(widgetInstanceId);
        },
        onActiveInstanceDeleted: () => {
            log('🗑️ Conversa deletada, resetando para ID padrão');
            deleteCookie(LAST_CHAT_COOKIE);
            setActiveWidgetId(id);
        },
    });

    // Salvar último chat no cookie quando chatInstanceId muda
    useEffect(() => {
        if (chatInstanceId && activeWidgetId) {
            log('💾 Salvando cookie:', activeWidgetId);
            setCookie(LAST_CHAT_COOKIE, activeWidgetId, { maxAge: 60 * 60 * 24 * 30 });
        }
    }, [chatInstanceId, activeWidgetId]);

    // Detectar novas propostas nas mensagens para abrir o modal
    useEffect(() => {
        const lastMessage = messages[messages.length - 1];
        if (lastMessage?.role === 'assistant' && lastMessage.type === 'ACTION_PROPOSAL' && lastMessage.proposal) {
            log('🎯 Proposta detectada, abrindo modal:', lastMessage.proposal.id);
            setProposalToConfirm(lastMessage.proposal);
        }
    }, [messages]);

    // Hook de mensagens - envia para backend e GPT
    const {
        handleSendMessage,
        isSendingMessage,
        sendMessageError,
        messagesEndRef,
    } = useChatMessages({
        chatInstanceId,
        isInstanceLoading,
        messages,
        setMessages,
        inputRef,
    });

    const handleNewChat = useCallback(() => {
        const newWidgetId = `generic-chat-${Date.now()}`;
        log('➕ Nova conversa:', newWidgetId);
        setActiveWidgetId(newWidgetId);
        toggleDropdown();
    }, [toggleDropdown]);

    const handleSelectInstance = useCallback((widgetInstanceId: string) => {
        log('👆 Selecionando:', widgetInstanceId);
        setActiveWidgetId(widgetInstanceId);
        toggleDropdown();
    }, [toggleDropdown]);

    const handleSend = useCallback(async () => {
        if (!inputValue.trim() || isSendingMessage || isInstanceLoading) return;
        const message = inputValue;
        setInputValue('');
        await handleSendMessage(message);
    }, [inputValue, isSendingMessage, isInstanceLoading, handleSendMessage]);

    const handleKeyPress = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    }, [handleSend]);

    const handleClose = useCallback(() => {
        if (onClose) onClose(id);
    }, [id, onClose]);

    const handleClearMessages = useCallback(() => {
        setMessages([]);
    }, [setMessages]);

    const handleConfirmProposal = useCallback(async () => {
        if (!proposalToConfirm) return;
        const proposalId = proposalToConfirm.id;
        setProposalToConfirm(null);
        log('✅ Confirmando proposta:', proposalId);
        // Enviamos um comando especial ou apenas o ID da proposta para o backend
        await handleSendMessage('', proposalId);
    }, [proposalToConfirm, handleSendMessage]);

    const isLoading = isInstanceLoading || isSendingMessage;
    const error = errorInstance || sendMessageError;

    return (
        <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-sm flex flex-col h-full w-full overflow-hidden border border-gray-200 dark:border-gray-800">
            {/* Header with Dropdown */}
            <div className="flex items-center justify-between px-3 py-2.5 bg-gray-50/50 dark:bg-neutral-800/30 border-b border-gray-200 dark:border-gray-800 cursor-move drag-handle group select-none">
                <div className="flex items-center gap-2 relative">
                    <svg className="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                    </svg>

                    <button
                        onClick={toggleDropdown}
                        className="flex items-center gap-1 font-semibold text-xs tracking-wide uppercase text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors"
                    >
                        <span className="truncate max-w-[150px]">{chatTitle || title}</span>
                        <svg className={`w-3.5 h-3.5 text-gray-400 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                        </svg>
                    </button>

                    {isDropdownOpen && (
                        <div className="absolute top-full left-0 mt-2 w-72 bg-white dark:bg-neutral-900 border border-gray-200 dark:border-gray-800 rounded-lg shadow-lg z-50 p-2 text-gray-900 dark:text-white">
                            <div>
                                <button
                                    onClick={handleNewChat}
                                    className="block w-full text-left px-3 py-2 mb-2 text-sm font-medium rounded hover:bg-gray-100 dark:hover:bg-neutral-800 border border-transparent hover:border-gray-300 dark:hover:border-gray-700 transition"
                                >
                                    <div className="flex items-center gap-2">
                                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                                        </svg>
                                        {t('chat.new_conversation', 'New Conversation')}
                                    </div>
                                </button>
                            </div>

                            <div className="max-h-64 overflow-y-auto custom-scrollbar">
                                {isLoadingInstances ? (
                                    <div className="p-3 text-center text-xs text-gray-500">{t('status.loading', 'Loading...')}</div>
                                ) : allChatInstances.length === 0 ? (
                                    <div className="p-3 text-center text-xs text-gray-500">{t('chat.no_conversations', 'No conversations')}</div>
                                ) : (
                                    allChatInstances.map((instance) => {
                                        const isBeingDeleted = instanceIdPendingDelete === instance.id;
                                        const isBeingRenamed = instanceIdBeingRenamed === instance.id;
                                        const isCurrent = instance.id === chatInstanceId;

                                        if (isBeingRenamed) {
                                            return (
                                                <div key={instance.id} className="p-2 bg-slate-50 dark:bg-zinc-700">
                                                    <input
                                                        type="text"
                                                        value={renameValue}
                                                        onChange={(e) => setRenameValue(e.target.value)}
                                                        placeholder="Novo nome..."
                                                        className="w-full px-2 py-1 text-sm rounded border border-slate-300 dark:border-zinc-600 bg-white dark:bg-zinc-800"
                                                        autoFocus
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter') confirmRename(instance.id, renameValue);
                                                            else if (e.key === 'Escape') cancelRename();
                                                        }}
                                                    />
                                                    <div className="flex gap-1 mt-1">
                                                        <button onClick={() => confirmRename(instance.id, renameValue)} disabled={isRenamingInstance} className="flex-1 px-2 py-1 text-xs bg-indigo-500 text-white rounded hover:bg-indigo-600 disabled:opacity-50">{isRenamingInstance ? '...' : t('actions.save', 'Save')}</button>
                                                        <button onClick={cancelRename} className="flex-1 px-2 py-1 text-xs bg-slate-200 dark:bg-zinc-600 rounded">{t('actions.cancel', 'Cancel')}</button>
                                                    </div>
                                                </div>
                                            );
                                        }

                                        if (isBeingDeleted) {
                                            return (
                                                <div key={instance.id} className="p-2 bg-red-50 dark:bg-red-900/20">
                                                    <p className="text-xs text-red-600 dark:text-red-400 mb-2">{t('actions.delete', 'Delete')} &ldquo;{instance.title || 'Chat'}&rdquo;?</p>
                                                    <div className="flex gap-1">
                                                        <button onClick={() => confirmDeleteInstance(instance.id)} disabled={isDeletingInstance} className="flex-1 px-2 py-1 text-xs bg-red-500 text-white rounded hover:bg-red-600 disabled:opacity-50">{isDeletingInstance ? '...' : t('actions.delete', 'Delete')}</button>
                                                        <button onClick={cancelDeleteConfirmation} className="flex-1 px-2 py-1 text-xs bg-slate-200 dark:bg-zinc-600 rounded">{t('actions.cancel', 'Cancel')}</button>
                                                    </div>
                                                </div>
                                            );
                                        }

                                        return (
                                            <div key={instance.id} className={`flex items-center gap-1 px-2 py-1.5 rounded hover:bg-gray-50 dark:hover:bg-neutral-800/50 transition-colors group ${isCurrent ? 'bg-gray-100 dark:bg-neutral-800 ring-1 ring-gray-900 dark:ring-white' : ''}`}>
                                                <button onClick={() => handleSelectInstance(instance.widgetInstanceId)} className={`flex-1 text-left text-sm ${isCurrent ? 'text-gray-900 dark:text-white' : 'text-gray-700 dark:text-gray-300'} hover:text-gray-900 dark:hover:text-white`}>
                                                    <div className="truncate">{instance.title || 'Chat sem título'}</div>
                                                    <div className="text-xs text-gray-400">{new Date(instance.updatedAt).toLocaleDateString()}</div>
                                                </button>
                                                <button onClick={(e) => { e.stopPropagation(); setRenameValue(instance.title || ''); startRename(instance.id); }} className="p-1.5 ml-1 rounded text-gray-400 hover:text-black dark:hover:text-white hover:bg-gray-200 dark:hover:bg-neutral-700 transition" title="Renomear">
                                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" /></svg>
                                                </button>
                                                <button onClick={(e) => { e.stopPropagation(); requestDeleteConfirmation(instance.id); }} className="p-1.5 ml-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 opacity-0 group-hover:opacity-100 transition-all" title={t('actions.delete', 'Delete')}>
                                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                                </button>
                                            </div>
                                        );
                                    })
                                )}
                            </div>
                        </div>
                    )}
                </div>

                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    {onClose && (
                        <button onMouseDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); handleClose(); }} className="widget-action-btn p-1 rounded text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors focus:outline-none" title={t('actions.close', 'Close')}>
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                    )}
                </div>
            </div>

            {isDropdownOpen && <div className="fixed inset-0 z-40" onClick={toggleDropdown} />}

            {contextProvider && <div className="px-3 py-2 border-b border-slate-200 dark:border-zinc-700 bg-slate-50/50 dark:bg-zinc-900/50">{contextProvider}</div>}

            {/* Messages */}
            <div className="flex-grow overflow-y-auto p-4 space-y-4 custom-scrollbar">
                {messages.length === 0 ? (
                    <div className="flex items-center justify-center h-full text-gray-400 dark:text-gray-500">
                        <div className="text-center">
                            <svg className="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" /></svg>
                            <p className="text-sm">{t('chat.ask_anything', 'Ask anything!')}</p>
                            <p className="text-xs mt-1 opacity-75">{t('chat.connected_to_engine', 'Connected to Analysis Engine')}</p>
                        </div>
                    </div>
                ) : (
                    messages.map((msg, idx) => (
                        <div key={msg.id || idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[80%] rounded px-4 py-2.5 ${msg.role === 'user' ? 'bg-black dark:bg-white text-white dark:text-black' : 'bg-gray-100 dark:bg-neutral-800 border border-gray-200 dark:border-gray-800 text-gray-800 dark:text-gray-200'}`}>
                                <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                            </div>
                        </div>
                    ))
                )}
                {isSendingMessage && (
                    <div className="flex justify-start">
                        <div className="border border-gray-200 dark:border-gray-800 bg-gray-100 dark:bg-neutral-800 rounded px-4 py-3">
                            <div className="flex space-x-1">
                                <div className="w-2 h-2 bg-gray-400 dark:bg-gray-600 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                                <div className="w-2 h-2 bg-gray-400 dark:bg-gray-600 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                                <div className="w-2 h-2 bg-gray-400 dark:bg-gray-600 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                            </div>
                        </div>
                    </div>
                )}
                <div ref={messagesEndRef} />
            </div>

            {error && (
                <div className="px-4 py-2 bg-red-50 dark:bg-red-900/20 border-t border-red-200 dark:border-red-800">
                    <p className="text-xs text-red-600 dark:text-red-400">{error}</p>
                </div>
            )}

            {/* Input */}
            <div className="p-3 border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-neutral-900">
                <div className="flex items-end gap-2">
                    <textarea
                        ref={inputRef}
                        value={inputValue}
                        onChange={(e) => setInputValue(e.target.value)}
                        onKeyDown={handleKeyPress}
                        placeholder={inputPlaceholder}
                        rows={1}
                        disabled={isLoading}
                        className="flex-1 resize-none rounded custom-scrollbar border border-gray-300 dark:border-gray-700 bg-gray-50 dark:bg-neutral-800/80 px-3 py-2 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-black dark:focus:ring-white disabled:opacity-50"
                        style={{ minHeight: '38px', maxHeight: '120px' }}
                    />
                    <button onClick={handleSend} disabled={isLoading || !inputValue.trim()} className="flex-shrink-0 p-2 rounded bg-black dark:bg-white text-white dark:text-black hover:opacity-80 disabled:opacity-50 disabled:cursor-not-allowed transition">
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
                    </button>
                </div>
            </div>

            {/* AI Command Confirmation Modal */}
            {proposalToConfirm && (
                <CommandConfirmationModal
                    isOpen={!!proposalToConfirm}
                    proposal={proposalToConfirm}
                    onClose={() => setProposalToConfirm(null)}
                    onConfirm={handleConfirmProposal}
                />
            )}
        </div>
    );
}

export default GenericChatWidget;
