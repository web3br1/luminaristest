import { useState, useCallback, useEffect, useRef } from 'react';
import { Message, BackendMessage } from './useChatInstance';

const SCROLL_BEHAVIOR = 'smooth' as const;

/**
 * Props para o hook useChatMessages.
 */
export interface UseChatMessagesProps {
    chatInstanceId: string | null;
    isInstanceLoading: boolean;
    messages: Message[];
    setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
    inputRef: React.RefObject<HTMLInputElement | HTMLTextAreaElement | null>;
    /** IDs dos documentos selecionados (apenas para DOCUMENT chat) */
    selectedDocumentIds?: string[];
}

/**
 * Valores retornados pelo hook useChatMessages.
 */
export interface UseChatMessagesReturn {
    handleSendMessage: (inputValue: string, confirmedProposalId?: string) => Promise<void>;
    isSendingMessage: boolean;
    sendMessageError: string | null;
    clearSendMessageError: () => void;
    messagesEndRef: React.RefObject<HTMLDivElement | null>;
}

/**
 * Hook compartilhado para gerenciar envio de mensagens.
 * Funciona para ambos DOCUMENT (com documentIds) e GENERIC (sem documentIds) chats.
 */
export function useChatMessages({
    chatInstanceId,
    isInstanceLoading,
    messages,
    setMessages,
    inputRef,
    selectedDocumentIds = [], // Default vazio para GenericChat
}: UseChatMessagesProps): UseChatMessagesReturn {
    const [isSendingMessage, setIsSendingMessage] = useState(false);
    const [sendMessageError, setSendMessageError] = useState<string | null>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const scrollToBottom = useCallback(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: SCROLL_BEHAVIOR });
    }, []);

    useEffect(() => {
        scrollToBottom();
    }, [messages, scrollToBottom]);

    const clearSendMessageError = useCallback(() => {
        setSendMessageError(null);
    }, []);

    const handleSendMessage = useCallback(async function handleSendMessage(inputValue: string, confirmedProposalId?: string) {
        const trimmedInput = inputValue.trim();
        if (!trimmedInput && !confirmedProposalId) return;
        if (isSendingMessage || !chatInstanceId || isInstanceLoading) return;

        // Prevent sending with temporary IDs
        if (chatInstanceId.startsWith('new-chat-')) {
            console.error('Attempted to send message with a temporary new chat ID:', chatInstanceId);
            const tempIdError = 'Ainda configurando o novo chat. Por favor, aguarde um momento e tente novamente.';
            setSendMessageError(tempIdError);
            setMessages(prevMessages => [...prevMessages, { role: 'assistant', content: `Erro: ${tempIdError}` }]);
            setIsSendingMessage(false);
            inputRef.current?.focus();
            return;
        }

        const newUserMessage: Message = {
            role: 'user',
            content: trimmedInput,
            timestamp: Date.now(),
        };

        setMessages(prevMessages => [...prevMessages, newUserMessage]);
        setIsSendingMessage(true);
        setSendMessageError(null);

        try {
            const { getCookie } = await import('cookies-next');
            const token = getCookie('auth_token');

            // Send to the chat API. The server persists both the user message and the assistant reply.
            // If there are no documentIds, the backend answers directly with the LLM.
            const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/chat`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`,
                },
                body: JSON.stringify({
                    query: confirmedProposalId ? (trimmedInput || '[Confirmado]') : trimmedInput,
                    chatInstanceId: chatInstanceId,
                    documentIds: selectedDocumentIds.length > 0 ? selectedDocumentIds : undefined,
                    confirmedProposalId,
                }),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.message || `Falha ao enviar mensagem (status ${response.status})`);
            }

            const responseBody = await response.json();
            // API wraps responses as { success, data }; fall back to the raw body for safety.
            const payload = responseBody?.data ?? responseBody;
            const responseContent = payload.answer || payload.content || payload.response || 'Não foi possível obter uma resposta';

            const assistantMessage: Message = {
                role: 'assistant',
                content: responseContent,
                timestamp: Date.now(),
                type: payload.type,
                proposal: payload.proposal,
            };
            setMessages(prevMessages => [...prevMessages, assistantMessage]);
        } catch (error: unknown) {
            const errorMessageContent = `Erro: ${error instanceof Error ? error.message : error || 'Não foi possível enviar a mensagem.'}`;
            const networkErrorMessage: Message = {
                role: 'assistant',
                content: errorMessageContent,
            };
            setMessages(prevMessages => [...prevMessages, networkErrorMessage]);
            setSendMessageError(error instanceof Error ? error.message : errorMessageContent);
        } finally {
            setIsSendingMessage(false);
            inputRef.current?.focus();
        }
    }, [chatInstanceId, isInstanceLoading, setMessages, inputRef, selectedDocumentIds]);

    return {
        handleSendMessage,
        isSendingMessage,
        sendMessageError,
        clearSendMessageError,
        messagesEndRef,
    };
}
