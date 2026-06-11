'use client';

import { useState, useCallback } from 'react';
import { GenericChatMessage, UseGenericChatReturn } from '../types/generic-chat.types';

/**
 * Hook simplificado para gerenciar estado do chat genérico.
 * Projetado para ser expansível para diferentes contextos (Dynamic Tables, etc.)
 */
export function useGenericChat(): UseGenericChatReturn {
    const [messages, setMessages] = useState<GenericChatMessage[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const sendMessage = useCallback(async (content: string) => {
        if (!content.trim()) return;

        // Adiciona mensagem do usuário
        const userMessage: GenericChatMessage = {
            role: 'user',
            content: content.trim(),
            timestamp: Date.now(),
        };

        setMessages(prev => [...prev, userMessage]);
        setIsLoading(true);
        setError(null);

        try {
            // Simula resposta (será substituído por integração real no futuro)
            // Para Dynamic Tables, aqui entraria a chamada para análise de dados
            await new Promise(resolve => setTimeout(resolve, 500));

            const assistantMessage: GenericChatMessage = {
                role: 'assistant',
                content: 'Este é um chat genérico em desenvolvimento. Em breve você poderá fazer perguntas sobre suas tabelas dinâmicas!',
                timestamp: Date.now(),
            };

            setMessages(prev => [...prev, assistantMessage]);
        } catch (err) {
            const errorMessage = err instanceof Error ? err.message : 'Falha ao enviar mensagem';
            setError(errorMessage);

            setMessages(prev => [...prev, {
                role: 'assistant',
                content: `Erro: ${errorMessage}`,
                timestamp: Date.now(),
            }]);
        } finally {
            setIsLoading(false);
        }
    }, []);

    const clearMessages = useCallback(() => {
        setMessages([]);
        setError(null);
    }, []);

    return {
        messages,
        isLoading,
        error,
        sendMessage,
        clearMessages,
    };
}
