import React, { RefObject, useEffect, useRef } from 'react';

const MAX_MESSAGE_LENGTH = 1000; // Consistente com useChatInput

interface ChatMessageInputProps {
  // De useChatInput
  inputValue: string;
  handleInputChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  handleInputKeyPress: (event: React.KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  clearInput: () => void;
  inputRef: RefObject<HTMLInputElement | HTMLTextAreaElement | null>;

  // De useChatMessages (para estado do botão e placeholder)
  isSendingMessage: boolean;
  
  // De useChatInstance (para estado do botão e placeholder)
  isInstanceLoading: boolean;
  isDuplicateInstance: boolean;
  errorInstance: string | null; // Para desabilitar input se houver erro de instância

  // De useChatMessages (para submissão pelo botão)
  onSendMessage: (message: string) => Promise<void>;
  
  // Erro geral do ChatWidget, para desabilitar o input
  generalWidgetError: string | null;

  // Novo prop para o botão de documentos
  documentSelector?: React.ReactNode;
}

export function ChatMessageInput({
  inputValue,
  handleInputChange,
  handleInputKeyPress,
  clearInput,
  inputRef,
  isSendingMessage,
  isInstanceLoading,
  isDuplicateInstance,
  errorInstance,
  onSendMessage,
  generalWidgetError,
  documentSelector,
}: ChatMessageInputProps) {

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  // Usar o textareaRef local ou o inputRef passado como prop
  const finalTextareaRef = textareaRef;

  const isDisabled = isSendingMessage || isInstanceLoading || !!generalWidgetError || isDuplicateInstance || !!errorInstance;
  let placeholderText = "Pergunte alguma coisa...";
  if (isSendingMessage) placeholderText = "Aguarde...";
  else if (isInstanceLoading) placeholderText = "Carregando chat...";
  else if (isDuplicateInstance) placeholderText = "Chat duplicado.";
  else if (generalWidgetError || errorInstance) placeholderText = "Erro no chat.";

  // Função para ajustar a altura do textarea automaticamente
  const adjustTextareaHeight = () => {
    const textarea = finalTextareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`; // Máximo de 200px
    }
  };

  // Ajustar altura quando o valor muda
  useEffect(() => {
    adjustTextareaHeight();
  }, [inputValue]);

  // Ajustar altura na montagem inicial
  useEffect(() => {
    adjustTextareaHeight();
  }, []);

  function handleSendButtonClick() {
    if (inputValue.trim()) {
      onSendMessage(inputValue);
      clearInput();
      // Resetar altura após enviar
      if (finalTextareaRef.current) {
        finalTextareaRef.current.style.height = 'auto';
      }
    }
  }

  return (
    <div className="p-4 border-t border-slate-200 dark:border-zinc-700 bg-slate-50 dark:bg-zinc-800">
      <div className="relative flex items-end bg-white dark:bg-zinc-700 border border-slate-300 dark:border-zinc-600 rounded-2xl transition-all duration-200">
        {/* Botão de documentos à esquerda */}
        {documentSelector && (
          <div className="flex-shrink-0 p-2">
            {documentSelector}
          </div>
        )}

        {/* Textarea que cresce automaticamente */}
        <div className="flex-1 min-w-0 flex items-center py-1">
          <textarea
            ref={finalTextareaRef}
            value={inputValue}
            onChange={handleInputChange}
            onKeyPress={handleInputKeyPress}
            placeholder={placeholderText}
            disabled={isDisabled}
            maxLength={MAX_MESSAGE_LENGTH}
            rows={1}
            className="w-full px-3 py-1 text-sm bg-white dark:bg-zinc-700 border-none outline-none resize-none text-slate-800 dark:text-slate-200 placeholder-slate-400 dark:placeholder-zinc-400 disabled:opacity-60 focus:ring-0 focus:border-none chat-scrollbar"
            aria-label="Message input"
            style={{ 
              minHeight: '36px',
              maxHeight: '200px',
              overflowY: 'auto'
            }}
          />
        </div>

        {/* Botão de enviar à direita */}
        <div className="flex-shrink-0 p-2">
          <button
            onClick={handleSendButtonClick}
            disabled={isDisabled || !inputValue.trim()}
            className="p-2 bg-blue-500 hover:bg-blue-600 disabled:bg-blue-300 text-white rounded-xl focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 dark:focus:ring-offset-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-lg hover:shadow-xl transform hover:scale-105 disabled:transform-none"
            aria-label="Send message"
          >
            {isSendingMessage ? (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path d="M10.894 2.553a1 1 0 00-1.789 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </div>
  );
} 