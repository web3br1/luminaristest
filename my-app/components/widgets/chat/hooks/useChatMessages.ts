import { useState, useCallback, useEffect, useRef } from 'react';
import { Message, BackendMessage } from '../types/chat.types';

const SCROLL_BEHAVIOR = 'smooth' as const;

/**
 * Props para o hook useChatMessages.
 */
interface UseChatMessagesProps {
  chatInstanceId: string | null;
  isInstanceLoading: boolean;
  messages: Message[];
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  inputRef: React.RefObject<HTMLInputElement | HTMLTextAreaElement | null>;
  selectedDocumentIds: string[];
}

/**
 * Valores retornados pelo hook useChatMessages.
 */
interface UseChatMessagesReturn {
  /** Função para processar e enviar uma nova mensagem. Recebe o valor do input. */
  handleSendMessage: (inputValue: string) => Promise<void>;
  /** Booleano indicando se uma mensagem está atualmente sendo enviada. */
  isSendingMessage: boolean;
  /** Mensagem de erro relacionada ao envio da última mensagem. Null se não houver erro. */
  sendMessageError: string | null;
  /** Função para limpar o `sendMessageError`. */
  clearSendMessageError: () => void;
  /** Ref para ser anexado ao final da lista de mensagens para habilitar o scroll automático. */
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
}

/**
 * Hook customizado para gerenciar o envio de mensagens e o comportamento de scroll em um chat.
 * Responsabilidades:
 * - Enviar uma nova mensagem para o backend.
 * - Atualizar optimisticamente a lista de mensagens com a mensagem do usuário.
 * - Adicionar a resposta do assistente (ou erro) à lista de mensagens.
 * - Gerenciar o estado de carregamento (`isSendingMessage`) e erro (`sendMessageError`) do envio.
 * - Lidar com o scroll automático para a última mensagem.
 */
export function useChatMessages({
  chatInstanceId,
  isInstanceLoading,
  messages,
  setMessages,
  inputRef,
  selectedDocumentIds,
}: UseChatMessagesProps): UseChatMessagesReturn {
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [sendMessageError, setSendMessageError] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  /**
   * Rola a visão para o final da lista de mensagens.
   */
  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: SCROLL_BEHAVIOR });
  }, []);

  // Efeito para rolar para baixo quando novas mensagens são adicionadas.
  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  /**
   * Limpa qualquer erro de envio de mensagem armazenado.
   */
  const clearSendMessageError = useCallback(() => {
    setSendMessageError(null);
  }, []);

  /**
   * Processa e envia uma mensagem do usuário.
   * Adiciona a mensagem do usuário à UI optimisticamente, envia para a API,
   * e então adiciona a resposta do assistente ou uma mensagem de erro.
   */
  const handleSendMessage = useCallback(async function handleSendMessage(inputValue: string) {
    const trimmedInput = inputValue.trim();
    // Não envia se não houver input, se já estiver enviando, ou se a instância não estiver pronta.
    if (!trimmedInput || isSendingMessage || !chatInstanceId || isInstanceLoading) return;

    // Safeguard: Prevent sending if chatInstanceId looks like a temporary frontend ID
    if (chatInstanceId.startsWith('new-chat-')) {
      console.error('Attempted to send message with a temporary new chat ID:', chatInstanceId);
      const tempIdError = 'Ainda configurando o novo chat. Por favor, aguarde um momento e tente novamente.';
      setSendMessageError(tempIdError);
      setMessages(prevMessages => [...prevMessages, { role: 'assistant', content: `Erro: ${tempIdError}` }]);
      setIsSendingMessage(false); // Ensure sending state is reset
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
      // 1. Primeiro salvamos a mensagem do usuário no banco de dados
      console.log('Salvando mensagem do usuário no banco:', { content: trimmedInput, instanceId: chatInstanceId, role: 'user' });

      if (chatInstanceId && !chatInstanceId.startsWith('new-chat-')) {
        try {
          const { getCookie } = await import('cookies-next');
          const token = getCookie('auth_token');
          const saveUserMsgResponse = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/chat-messages`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({
              content: trimmedInput,
              chatInstanceId: chatInstanceId, // Corrigido: instanceId -> chatInstanceId
              role: 'user'
            }),
            // credentials: 'include',
          });

          if (!saveUserMsgResponse.ok) {
            const errorText = await saveUserMsgResponse.text();
            console.warn(`Falha ao salvar mensagem do usuário (${saveUserMsgResponse.status}):`, errorText);
            // Continuamos mesmo com erro de salvamento, apenas logamos
          } else {
            const savedMessage = await saveUserMsgResponse.json();
            console.log('Mensagem do usuário salva com sucesso:', savedMessage.data?.id);
          }
        } catch (saveError) {
          console.error('Erro ao salvar mensagem do usuário:', saveError);
          // Continuamos mesmo com erro de salvamento
        }
      }

      // 2. Enviamos para a API de chat para processamento
      console.log('Enviando query para API de chat:', { query: trimmedInput, documentIds: selectedDocumentIds });

      const { getCookie } = await import('cookies-next');
      const token = getCookie('auth_token');
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          query: trimmedInput,  // Alterado de 'message' para 'query' para corresponder ao schema do backend
          chatInstanceId: chatInstanceId, // Este campo será ignorado pelo backend, mas mantemos por compatibilidade
          documentIds: selectedDocumentIds,
        }),
        // credentials: 'include',
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.message || `Falha ao enviar mensagem (status ${response.status})`);
      }

      const responseBody = await response.json();

      // Log para diagnóstico
      console.log('Resposta da API de chat:', responseBody);

      // Verificamos todos os possíveis campos onde a resposta pode estar
      const responseContent = responseBody.response || responseBody.answer || responseBody.content || 'Não foi possível obter uma resposta';

      const assistantMessage: Message = {
        role: 'assistant',
        content: responseContent,
        timestamp: Date.now(),
      };
      setMessages(prevMessages => [...prevMessages, assistantMessage]);

      // Salvar a resposta do assistente no banco de dados
      if (chatInstanceId && !chatInstanceId.startsWith('new-chat-')) {
        try {
          console.log('Salvando resposta do assistente no banco:', {
            content: responseContent.length > 50 ? responseContent.substring(0, 50) + '...' : responseContent,
            instanceId: chatInstanceId,
            role: 'assistant'
          });

          const saveAssistantMsgResponse = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/chat-messages`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`,
            },
            body: JSON.stringify({
              content: responseContent,
              chatInstanceId: chatInstanceId, // Corrigido: instanceId -> chatInstanceId
              role: 'assistant'
            }),
            // credentials: 'include',
          });

          if (!saveAssistantMsgResponse.ok) {
            const errorText = await saveAssistantMsgResponse.text();
            console.warn(`Falha ao salvar resposta do assistente (${saveAssistantMsgResponse.status}):`, errorText);
            // Mesmo com falha ao salvar, mantemos a resposta exibida ao usuário
          } else {
            const savedMessage = await saveAssistantMsgResponse.json();
            console.log('Resposta do assistente salva com sucesso:', savedMessage.data?.id);
          }
        } catch (saveError) {
          console.error('Erro ao salvar resposta do assistente:', saveError);
          // Continuamos exibindo a resposta mesmo com erro de salvamento
        }
      }
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
      inputRef.current?.focus(); // Foca o input após o término do envio (sucesso ou falha).
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