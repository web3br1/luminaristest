import { useState, useEffect, useCallback, useRef } from 'react';

// Shared types for both Document and Generic chats
export interface ChatInstance {
    id: string;
    widgetInstanceId: string;
    title: string | null;
    type: 'DOCUMENT' | 'GENERIC';
    createdAt: string;
    updatedAt: string;
}

export interface BackendMessage {
    id: string;
    content: string;
    role: 'USER' | 'ASSISTANT';
    chatInstanceId: string;
    createdAt: string;
    metadata?: Record<string, unknown>; // Para armazenar metadados da proposta se necessário
}

export interface Message {
    id?: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp?: number;
    type?: 'TEXT' | 'ACTION_PROPOSAL';
    proposal?: {
        id: string;
        action: 'CREATE' | 'UPDATE' | 'DELETE';
        tableName: string;
        tableLabel: string;
        data: Record<string, unknown>;
    };
}

export interface UseChatInstanceProps {
    chatType: 'DOCUMENT' | 'GENERIC';
    currentWidgetInstanceId: string | null;
}

export interface UseChatInstanceReturn {
    chatInstanceId: string | null;
    chatTitle: string | null;
    setChatTitle: React.Dispatch<React.SetStateAction<string | null>>;
    messages: Message[];
    setMessages: React.Dispatch<React.SetStateAction<Message[]>>;
    isInstanceLoading: boolean;
    errorInstance: string | null;
    initializeChat: (widgetId: string) => Promise<void>;
}

const DEBUG = true;
function log(...args: unknown[]) {
    if (DEBUG) console.log('[useChatInstance]', ...args);
}

/**
 * Hook simplificado para gerenciar instâncias de chat.
 * Usa o endpoint getOrCreate para evitar duplicatas.
 */
export function useChatInstance({
    chatType,
    currentWidgetInstanceId,
}: UseChatInstanceProps): UseChatInstanceReturn {
    const [chatInstanceId, setChatInstanceId] = useState<string | null>(null);
    const [chatTitle, setChatTitle] = useState<string | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [isInstanceLoading, setIsInstanceLoading] = useState<boolean>(false);
    const [errorInstance, setErrorInstance] = useState<string | null>(null);

    // Refs para evitar chamadas duplicadas
    const lastInitializedIdRef = useRef<string | null>(null);
    const isInitializingRef = useRef<boolean>(false);

    const initializeChat = useCallback(async function initializeChat(widgetIdToInitialize: string) {
        // Proteção contra chamadas duplicadas
        if (isInitializingRef.current) {
            log('⚠️ Já está inicializando, ignorando chamada para:', widgetIdToInitialize);
            return;
        }

        if (widgetIdToInitialize === lastInitializedIdRef.current) {
            log('⚠️ Mesmo ID já inicializado, ignorando:', widgetIdToInitialize);
            return;
        }

        log('🚀 Iniciando chat com widgetId:', widgetIdToInitialize);

        isInitializingRef.current = true;
        setIsInstanceLoading(true);
        setMessages([]);
        setErrorInstance(null);
        setChatTitle(null);

        try {
            const { getCookie } = await import('cookies-next');
            const token = getCookie('auth_token');

            log('📤 POST /get-or-create com widgetId:', widgetIdToInitialize, 'type:', chatType);

            const instanceResponse = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/chat-instances/get-or-create`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
                body: JSON.stringify({
                    widgetInstanceId: widgetIdToInitialize,
                    type: chatType
                }),
            });

            if (!instanceResponse.ok) {
                const errorText = await instanceResponse.text();
                log('❌ Erro na resposta:', instanceResponse.status, errorText);
                throw new Error(`Failed to get/create chat instance (status ${instanceResponse.status})`);
            }

            const instanceJson = await instanceResponse.json();
            const instance: ChatInstance = instanceJson.data;

            log('✅ Instância recebida:', {
                id: instance.id,
                widgetInstanceId: instance.widgetInstanceId,
                title: instance.title
            });

            lastInitializedIdRef.current = widgetIdToInitialize;
            setChatInstanceId(instance.id);
            setChatTitle(instance.title);

            // Carrega mensagens existentes
            try {
                const messagesResponse = await fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL}/chat-messages?instanceId=${instance.id}`, {
                    headers: { 'Authorization': `Bearer ${token}` },
                });

                if (messagesResponse.ok) {
                    const messagesJson = await messagesResponse.json();
                    const backendMessages: BackendMessage[] = messagesJson.data || [];
                    log('📨 Mensagens carregadas:', backendMessages.length);

                    if (backendMessages.length > 0) {
                        const formattedMessages: Message[] = backendMessages.map((bm) => ({
                            id: bm.id,
                            role: bm.role.toLowerCase() as 'user' | 'assistant',
                            content: bm.content,
                            timestamp: new Date(bm.createdAt).getTime(),
                        }));
                        formattedMessages.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
                        setMessages(formattedMessages);
                    }
                }
            } catch (error) {
                log('⚠️ Erro ao carregar mensagens:', error);
            }
        } catch (err: unknown) {
            log('❌ Erro ao inicializar:', err);
            setErrorInstance(err instanceof Error ? err.message : 'Falha ao inicializar o chat.');
        } finally {
            setIsInstanceLoading(false);
            isInitializingRef.current = false;
        }
    }, [chatType]);

    // Inicializa quando o widgetInstanceId muda
    useEffect(function initializeChatOnWidgetIdChange() {
        if (currentWidgetInstanceId) {
            log('📌 useEffect disparado com widgetId:', currentWidgetInstanceId);
            initializeChat(currentWidgetInstanceId);
        }
    }, [currentWidgetInstanceId, initializeChat]);

    return {
        chatInstanceId,
        chatTitle,
        setChatTitle,
        messages,
        setMessages,
        isInstanceLoading,
        errorInstance,
        initializeChat,
    };
}
