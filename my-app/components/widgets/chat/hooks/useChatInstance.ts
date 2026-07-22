import { useState, useEffect, useCallback, useRef } from 'react';
import { ChatInstance, BackendMessage, Message } from '../types/chat.types'; // Updated import
// Importação de persistência de chat removida

/**
 * Props para o hook useChatInstance.
 */
interface UseChatInstanceProps {
  /** ID da instância do widget atual à qual este chat está associado. */
  currentWidgetInstanceId: string | null;
  /** Ref para um Set contendo os IDs de todas as instâncias de chat ativas em outros widgets. Usado para detectar duplicatas. */
  activeChatInstanceIdsRef: React.RefObject<ReadonlySet<string>>;
  /** Callback invocado quando uma nova instância de chat é ativada por este hook. */
  onInstanceActivatedRef: React.RefObject<(chatInstanceId: string) => void>;
  /** Callback invocado quando a instância de chat previamente ativa deste widget é desativada (ex: ao trocar de chat). */
  onInstanceDeactivatedRef: React.RefObject<(chatInstanceId: string) => void>;
}

/**
 * Valores retornados pelo hook useChatInstance.
 */
interface UseChatInstanceReturn {
  /** ID da instância de chat atualmente carregada. Null se nenhuma estiver carregada ou durante o carregamento inicial. */
  chatInstanceId: string | null;
  /** Título da instância de chat atual. */
  chatTitle: string | null;
  /** Função para definir o título da instância de chat (usado para atualizações otimistas ou externas). */
  setChatTitle: React.Dispatch<React.SetStateAction<string | null>>;
  /** Array de mensagens para a instância de chat atual. */
  messages: Message[];
  /** Função para definir as mensagens (usado para atualizações otimistas ou externas). */
  setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
  /** Booleano indicando se a instância de chat está atualmente carregando. */
  isInstanceLoading: boolean;
  /** Mensagem de erro relacionada ao carregamento ou gerenciamento da instância. Null se não houver erro. */
  errorInstance: string | null;
  /** Booleano indicando se a instância de chat carregada é uma duplicata de uma já ativa em outro widget. */
  isDuplicateInstance: boolean;
  /** Função para inicializar/carregar uma instância de chat para um dado widgetId. Usada para carregar o chat inicial ou trocar de chat. */
  initializeChat: (widgetId: string) => Promise<void>;
  /** Função para resetar o estado da instância de chat. */
  resetChat: () => void;
}

/**
 * Hook customizado para gerenciar o ciclo de vida de uma instância de chat.
 * Responsável por:
 * - Buscar ou criar uma instância de chat (`ChatInstance`) para um `widgetInstanceId`.
 * - Carregar as mensagens (`ChatMessage`) para essa instância.
 * - Lidar com a ativação e desativação de instâncias para evitar duplicatas.
 * - Manter o estado da instância (ID, título, mensagens, estado de carregamento, erros).
 */
export function useChatInstance({
  currentWidgetInstanceId,
  activeChatInstanceIdsRef,
  onInstanceActivatedRef,
  onInstanceDeactivatedRef,
}: UseChatInstanceProps): UseChatInstanceReturn {
  const [chatInstanceId, setChatInstanceId] = useState<string | null>(null);
  const [chatTitle, setChatTitle] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isInstanceLoading, setIsInstanceLoading] = useState<boolean>(false);
  const [errorInstance, setErrorInstance] = useState<string | null>(null);
  const [isDuplicateInstance, setIsDuplicateInstance] = useState<boolean>(false);

  // Refs para rastrear o estado interno da última tentativa de inicialização deste hook para um widget específico.
  // Isso ajuda a `initializeChat` a saber se deve desativar uma instância anterior que *este hook* carregou.
  const internalPreviousChatIdRef = useRef<string | null>(null);
  const internalWasPreviouslyDuplicateRef = useRef<boolean>(false);

  /**
   * Inicializa uma instância de chat para o widgetId fornecido.
   * Busca uma instância existente ou cria uma nova, carrega suas mensagens,
   * e lida com a lógica de ativação/desativação para evitar duplicatas.
   */
  const initializeChat = useCallback(async function initializeChat(widgetIdToInitialize: string) {
    const previousChatIdForThisWidget = internalPreviousChatIdRef.current;
    const wasDuplicateForThisWidget = internalWasPreviouslyDuplicateRef.current;

    // console.debug(`useChatInstance (${widgetIdToInitialize}): Initializing. Prev ID for this widget: ${previousChatIdForThisWidget}, Was duplicate: ${wasDuplicateForThisWidget}`);

    setIsInstanceLoading(true);
    setIsDuplicateInstance(false);
    setMessages([]);
    setErrorInstance(null);
    setChatTitle(null);

    // Desativa a instância anterior gerenciada por ESTE hook para ESTE widget, se não era duplicata.
    if (previousChatIdForThisWidget && !wasDuplicateForThisWidget) {
      // console.debug(`useChatInstance (${widgetIdToInitialize}): Deactivating previous instance ${previousChatIdForThisWidget}.`);
      onInstanceDeactivatedRef.current?.(previousChatIdForThisWidget);
    }

    let newChatInstanceId: string | null = null;

    try {
      // Idempotent init: get-or-create returns the existing instance for this widget or creates one.
      const { getCookie } = await import('cookies-next');
      const token = getCookie('auth_token');
      const instanceResponse = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/chat-instances/get-or-create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ widgetInstanceId: widgetIdToInitialize, type: 'DOCUMENT' }),
        // credentials: 'include',
      });

      if (!instanceResponse.ok) {
        let apiErrorMessage = `Failed to get/create chat instance (status ${instanceResponse.status})`;
        try {
          const responseText = await instanceResponse.text();
          if (responseText) {
            const errorPayload = JSON.parse(responseText);
            if (errorPayload?.message) apiErrorMessage = errorPayload.message;
          }
        } catch (e) { /* console.warn(`useChatInstance (${widgetIdToInitialize}): Could not parse error response body.`); */ }
        throw new Error(apiErrorMessage);
      }

      const instanceJson = await instanceResponse.json();
      const instance: ChatInstance = instanceJson.data;
      newChatInstanceId = instance.id;
      // console.debug(`useChatInstance (${widgetIdToInitialize}): Obtained instance ID ${newChatInstanceId}.`);

      // Verifica se a instância recém-obtida já está ativa em outro lugar.
      // Log das instâncias ativas para diagnóstico
      const activeInstancesArray = Array.from(activeChatInstanceIdsRef.current || []);

      // Verificamos se a instância já está ativa em outro widget diferente
      // Criterios para considerar duplicada:
      // 1. A instância atual é válida (tem um ID)
      // 2. Existe pelo menos uma instância ativa
      // 3. A instância atual está na lista de instâncias ativas
      // 4. Não estamos recarregando a mesma instância que já estava ativa neste widget
      if (newChatInstanceId &&
        activeInstancesArray.length > 0 &&
        activeInstancesArray.includes(newChatInstanceId) &&
        newChatInstanceId !== internalPreviousChatIdRef.current) {
        setErrorInstance('Este chat já está aberto em outro widget.');
        setIsDuplicateInstance(true);
        setChatInstanceId(newChatInstanceId);
        internalPreviousChatIdRef.current = newChatInstanceId;
        internalWasPreviouslyDuplicateRef.current = true;
      } else if (newChatInstanceId) { // Procede se newChatInstanceId não for nulo e não for duplicata
        // console.debug(`useChatInstance (${widgetIdToInitialize}): Instance ${newChatInstanceId} is NOT a duplicate. Activating.`);
        setIsDuplicateInstance(false);
        internalWasPreviouslyDuplicateRef.current = false;
        internalPreviousChatIdRef.current = newChatInstanceId;
        setChatInstanceId(newChatInstanceId);
        setChatTitle(instance.title);

        // Notifica o componente pai que este hook ativou esta instância de chat.
        onInstanceActivatedRef.current?.(newChatInstanceId);

        try {
          const messagesResponse = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/chat-messages?instanceId=${newChatInstanceId}`, {
            headers: { 'Authorization': `Bearer ${token}` },
            // credentials: 'include',
          });

          if (!messagesResponse.ok) {
            // Tentamos obter uma mensagem de erro estruturada, mas se falhar, criamos uma mensagem genérica
            const errorMessage = await messagesResponse.text().then(text => {
              try {
                const errorData = JSON.parse(text);
                return errorData.message || `Falha ao carregar mensagens (status ${messagesResponse.status})`;
              } catch (e) {
                return `Falha ao carregar mensagens (status ${messagesResponse.status}): ${text.substring(0, 100)}`;
              }
            }).catch(() => `Falha ao carregar mensagens (status ${messagesResponse.status})`);

            console.error(`Erro ao carregar mensagens para ${newChatInstanceId}:`, errorMessage);

            // Definimos uma mensagem de erro para o usuário, mas continuamos sem lançar erro
            setMessages([{
              role: 'assistant',
              content: `Erro: ${errorMessage}`,
              timestamp: Date.now()
            }]);
          } else {
            const messagesJson = await messagesResponse.json();
            const backendMessages: BackendMessage[] = messagesJson.data || [];

            if (backendMessages.length === 0) {
              setMessages([]);
            } else {

              const formattedMessages: Message[] = backendMessages.map(function mapMessage(bm) {
                return {
                  id: bm.id,
                  role: bm.role.toLowerCase() as 'user' | 'assistant',
                  content: bm.content,
                  timestamp: new Date(bm.createdAt).getTime(),
                };
              });

              // Garantimos que as mensagens estão ordenadas por timestamp
              formattedMessages.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
              setMessages(formattedMessages);
            }
          }
        } catch (error) {
          console.error(`Erro inesperado ao carregar mensagens para ${newChatInstanceId}:`, error);

          // Definimos uma mensagem de erro para o usuário
          setMessages([{
            role: 'assistant',
            content: `Erro: Falha ao carregar o histórico de mensagens. ${error instanceof Error ? error.message : ''}`,
            timestamp: Date.now()
          }]);
        }
      }
    } catch (err: unknown) {
      // console.error(`useChatInstance (${widgetIdToInitialize}): Error during chat initialization:`, err);
      setErrorInstance(err instanceof Error ? err.message : 'Falha ao inicializar o chat.');
      setMessages([{ role: 'assistant', content: `Erro: ${err instanceof Error ? err.message : 'Falha ao inicializar o chat.'}` }]);
      if (newChatInstanceId) internalPreviousChatIdRef.current = newChatInstanceId;
      internalWasPreviouslyDuplicateRef.current = false;
    } finally {
      setIsInstanceLoading(false);
    }
  }, [activeChatInstanceIdsRef, onInstanceActivatedRef, onInstanceDeactivatedRef]);

  // Inicializa a instância de chat quando o widgetInstanceId muda ou quando o hook é montado pela primeira vez.
  useEffect(function initializeChatOnWidgetIdChange() {
    // Somente inicializar se tivermos um widgetInstanceId válido
    if (currentWidgetInstanceId) {
      initializeChat(currentWidgetInstanceId).catch(function handleInitError(error) {
        setErrorInstance(`Erro ao inicializar o chat: ${error?.message || 'Falha desconhecida'}`);
      });
    }
  }, [currentWidgetInstanceId, initializeChat]);

  /** Função para limpar o estado do chat. */
  const resetChat = useCallback(() => {
    setChatInstanceId(null);
    setChatTitle(null);
    setMessages([]);
    setErrorInstance(null);
    setIsDuplicateInstance(false);
    internalPreviousChatIdRef.current = null;
    internalWasPreviouslyDuplicateRef.current = false;
  }, []);

  return {
    chatInstanceId,
    chatTitle,
    setChatTitle,
    messages,
    setMessages,
    isInstanceLoading,
    errorInstance,
    isDuplicateInstance,
    initializeChat,
    resetChat,
  };
} 