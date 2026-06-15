'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useChatInstance } from '../hooks/useChatInstance';
import { useChatMessages } from '../hooks/useChatMessages';
import { useChatInput } from '../hooks/useChatInput';
import { useChatInstances } from '../hooks/UseChatInstances';

// Importar subcomponentes
import { ChatHeader } from './ChatHeader';
import { ChatMessageList } from './ChatMessageList';
import { ChatMessageInput } from './ChatMessageInput';
import { DocumentSelector, DocumentOption } from './DocumentSelector';

interface DocumentChatWidgetProps {
  id: string;
  onClose?: (id: string) => void;
  onInstanceActivated: (chatId: string) => void;
  onInstanceDeactivated: (chatId: string) => void;
  activeChatInstanceIds: ReadonlySet<string>;
  onDocumentAnalysis?: (documents: DocumentOption[]) => void;
  onGenerateChart?: (query: string, chatInstanceId: string, documentIds?: string[]) => void;
  lastAssistantMessage?: { chatInstanceId: string; message: string; timestamp: number } | null;
}

/**
 * Widget de chat para conversar sobre documentos vetorizados (Qdrant).
 * Permite selecionar documentos e fazer perguntas sobre seu conteúdo.
 */
function DocumentChatWidget({
  id: widgetInstanceId,
  onClose,
  onInstanceActivated,
  onInstanceDeactivated,
  activeChatInstanceIds,
  onDocumentAnalysis,
  onGenerateChart,
  lastAssistantMessage,
}: DocumentChatWidgetProps) {

  const [unifiedError, setUnifiedError] = useState<string | null>(null);
  const [selectedDocuments, setSelectedDocuments] = useState<DocumentOption[]>([]);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Refs para estabilizar callbacks
  const onInstanceActivatedRef = useRef(onInstanceActivated);
  const onInstanceDeactivatedRef = useRef(onInstanceDeactivated);
  const activeChatInstanceIdsRef = useRef(activeChatInstanceIds);

  useEffect(() => {
    onInstanceActivatedRef.current = onInstanceActivated;
    onInstanceDeactivatedRef.current = onInstanceDeactivated;
    activeChatInstanceIdsRef.current = activeChatInstanceIds;
  }, [onInstanceActivated, onInstanceDeactivated, activeChatInstanceIds]);

  // Hook para gerenciar a instância de chat ativa (mensagens, título, etc.)
  const {
    chatInstanceId,
    chatTitle,
    messages,
    setMessages,
    isInstanceLoading,
    errorInstance,
    isDuplicateInstance,
    initializeChat,
    resetChat,
  } = useChatInstance({
    currentWidgetInstanceId: widgetInstanceId,
    activeChatInstanceIdsRef,
    onInstanceActivatedRef,
    onInstanceDeactivatedRef,
  });

  // Hook para gerenciar as instâncias de chat (dropdown)
  const {
    allChatInstances,
    isDropdownOpen,
    toggleDropdown,
    handleSelectInstance,
    handleInitiateNewChat,
    instanceIdPendingDelete,
    isDeletingInstance,
    deleteInstanceError,
    requestDeleteConfirmation,
    cancelDeleteConfirmation,
    confirmDeleteInstance,
    loadInstancesError,
    isLoadingInstances,
  } = useChatInstances({
    currentWidgetInstanceId: chatInstanceId,
    onSelectChatInstance: initializeChat,
    onActiveInstanceDeleted: resetChat,
    widgetInstanceIdForLogging: widgetInstanceId,
  });

  const handleDocumentSelectionChange = useCallback(function handleDocSelection(docs: DocumentOption[]) {
    setSelectedDocuments(docs);
    if (onDocumentAnalysis) onDocumentAnalysis(docs);
  }, [onDocumentAnalysis]);

  // Hook para enviar mensagens
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
    selectedDocumentIds: selectedDocuments.map(doc => doc.id),
  });

  // Hook para o campo de entrada de texto
  const {
    inputValue,
    handleInputChange,
    handleInputKeyPress,
    clearInput,
  } = useChatInput({
    isSendingMessage,
    onSubmitMessage: handleSendMessage, // Envia diretamente, pois o chat já deve existir
    inputRef,
  });



  // Efeito para unificar e limpar erros
  useEffect(() => {
    const error = errorInstance || sendMessageError || loadInstancesError || deleteInstanceError;
    if (error) {
      setUnifiedError(error);
      const timer = setTimeout(() => setUnifiedError(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [errorInstance, sendMessageError, loadInstancesError, deleteInstanceError]);

  // Efeito de cleanup para desativar a instância ao desmontar
  useEffect(function cleanupOnUnmount() {
    return function cleanupInstance() {
      if (chatInstanceId && !isDuplicateInstance) {
        onInstanceDeactivated(chatInstanceId);
      }
    };
  }, [chatInstanceId, isDuplicateInstance, onInstanceDeactivated]);

  const handleCloseWidget = useCallback(function closeWidget() {
    if (onClose) {
      onClose(widgetInstanceId);
    }
  }, [onClose, widgetInstanceId]);

  return (
    <div className="bg-white dark:bg-zinc-800 rounded-lg shadow-lg flex flex-col h-full w-full overflow-hidden border border-slate-200 dark:border-zinc-700">
      <ChatHeader
        chatTitle={chatTitle || "Selecione ou crie uma conversa"}
        onClose={handleCloseWidget}
        // Props para o dropdown de instâncias
        isDropdownOpen={isDropdownOpen}
        toggleDropdown={toggleDropdown}
        instances={allChatInstances}
        onSelectInstance={handleSelectInstance}
        onInitiateNewChat={handleInitiateNewChat}
        instanceIdPendingDelete={instanceIdPendingDelete}
        isDeletingInstance={isDeletingInstance}
        deleteInstanceError={deleteInstanceError}
        requestDeleteConfirmation={requestDeleteConfirmation}
        cancelDeleteConfirmation={cancelDeleteConfirmation}
        confirmDeleteInstance={confirmDeleteInstance}
        isLoadingInstances={isLoadingInstances}
        loadInstancesError={loadInstancesError}
      />

      <div className="flex-grow flex flex-col overflow-y-hidden">
        {chatInstanceId ? (
          <>
            <ChatMessageList
              messages={messages}
              isSendingMessage={isSendingMessage}
              messagesEndRef={messagesEndRef}
              isDuplicateInstance={isDuplicateInstance}
              errorInstance={errorInstance}
              isInstanceLoading={isInstanceLoading}
            />
          </>
        ) : (
          <div className="flex-grow flex items-center justify-center text-center text-zinc-500 dark:text-zinc-400 px-4">
            <p>Selecione uma conversa no menu acima para começar.</p>
          </div>
        )}
      </div>

      {chatInstanceId && (
        <ChatMessageInput
          inputValue={inputValue}
          handleInputChange={handleInputChange}
          handleInputKeyPress={handleInputKeyPress}
          clearInput={clearInput}
          inputRef={inputRef}
          isSendingMessage={isSendingMessage}
          isInstanceLoading={isInstanceLoading}
          isDuplicateInstance={isDuplicateInstance}
          errorInstance={errorInstance}
          onSendMessage={handleSendMessage}
          generalWidgetError={unifiedError}
          documentSelector={
            <DocumentSelector onSelectionChange={handleDocumentSelectionChange} />
          }
        />
      )}

      {unifiedError && (
        <div className="p-2 bg-red-100 text-red-700 text-sm absolute bottom-0 w-full">
          {unifiedError}
        </div>
      )}
    </div>
  );
}

export default DocumentChatWidget;