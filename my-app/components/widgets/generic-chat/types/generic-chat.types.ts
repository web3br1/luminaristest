/**
 * Tipos para o GenericChatWidget - widget de chat expansível.
 */

export interface GenericChatMessage {
    id?: string;
    role: 'user' | 'assistant' | 'system';
    content: string;
    timestamp?: number;
}

export interface GenericChatWidgetProps {
    /** ID único do widget */
    id: string;
    /** Callback para fechar o widget */
    onClose?: (id: string) => void;
    /** Título personalizado do chat */
    title?: string;
    /** System prompt inicial (para contexto) */
    systemPrompt?: string;
    /** Endpoint da API (para extensibilidade futura) */
    apiEndpoint?: string;
    /** Slot para componente de contexto adicional (ex: seletor de tabelas) */
    contextProvider?: React.ReactNode;
    /** Placeholder para o input */
    inputPlaceholder?: string;
}

export interface UseGenericChatReturn {
    messages: GenericChatMessage[];
    isLoading: boolean;
    error: string | null;
    sendMessage: (content: string) => Promise<void>;
    clearMessages: () => void;
}
