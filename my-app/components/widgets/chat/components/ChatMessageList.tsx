import React, { RefObject } from 'react';
import { Message } from '../types/chat.types';
import ReactMarkdown from 'react-markdown';

interface ChatMessageListProps {
  // De useChatInstance
  isDuplicateInstance: boolean;
  errorInstance: string | null; // Usado para "Este chat já está aberto"
  isInstanceLoading: boolean;
  messages: Message[];

  // De useChatMessages
  isSendingMessage: boolean; // Para "Pensando..."
  messagesEndRef: RefObject<HTMLDivElement | null>;

  // Erro geral do widget (se aplicável para esta área)
  // Por enquanto, o erro de duplicidade é tratado com errorInstance.
  // Poderíamos passar o `error` geral do ChatWidget se ele devesse ser exibido aqui.
}

// Função de renderização de mensagem individual (pode ser interna ou externa)
function renderSingleMessage(msg: Message, index: number) {
  const isError = msg.content.startsWith('Erro:'); // Simplificado
  const isUser = msg.role === 'user';

  return (
    <div 
      key={`${msg.id || msg.timestamp}-${index}`} // Usar id se disponível, senão timestamp
      className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
    >
      <div
        className={`px-3 py-2 text-xs rounded-lg max-w-[85%] shadow-sm ${isUser
            ? 'bg-blue-500 dark:bg-blue-600 text-white'
            : isError
              ? 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300'
              : 'bg-slate-100 dark:bg-zinc-700 text-slate-800 dark:text-slate-200'
          }`}
      >
        <ReactMarkdown>{msg.content}</ReactMarkdown>
      </div>
    </div>
  );
}

export function ChatMessageList({
  isDuplicateInstance,
  errorInstance,
  isInstanceLoading,
  messages,
  isSendingMessage,
  messagesEndRef,
}: ChatMessageListProps) {
  if (isDuplicateInstance) {
    return (
      <div className="chat-scrollbar flex-grow p-3 overflow-y-auto bg-white dark:bg-zinc-900/50 flex justify-center items-center h-full">
        <p className="text-orange-600 dark:text-orange-400 text-xs p-3 bg-orange-100 dark:bg-orange-900/30 rounded-md text-center">
          {errorInstance || "Este chat já está aberto em outro widget."}
        </p>
      </div>
    );
  }

  return (
    <div className="chat-scrollbar flex-grow p-3 space-y-3 overflow-y-auto bg-white dark:bg-zinc-900/50">
      {isInstanceLoading && messages.length === 0 && (
        <div className="flex justify-center items-center h-full">
          <p className="text-slate-500 dark:text-slate-400 text-xs">Carregando histórico...</p>
        </div>
      )}
      
      {/* Exibe erro de instância (ex: falha ao carregar histórico) somente se não for duplicata e houver uma mensagem de erro específica */}
      {!isInstanceLoading && errorInstance && messages.length === 1 && messages[0].content.startsWith('Erro:') && (
          <div className="flex justify-center items-center h-full">
              <p className="text-red-500 dark:text-red-400 text-xs p-3 bg-red-100 dark:bg-red-900/30 rounded-md">{messages[0].content}</p>
          </div>
      )}

      {/* Renderiza mensagens se não houver erro de instância que já renderizou uma mensagem de erro única, ou se houver mensagens além da de erro */} 
      {!(errorInstance && messages.length === 1 && messages[0].content.startsWith('Erro:')) && messages.map(renderSingleMessage)}
      
      {isSendingMessage && (
        <div className="flex justify-start">
          <div className="px-3 py-2 text-xs bg-slate-100 dark:bg-zinc-700 text-slate-500 dark:text-slate-400 rounded-lg animate-pulse">
            Pensando...
          </div>
        </div>
      )}
      <div ref={messagesEndRef} />
    </div>
  );
} 