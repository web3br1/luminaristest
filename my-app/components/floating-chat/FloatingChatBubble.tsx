'use client';

import React from 'react';
import { useFloatingChat } from './FloatingChatProvider';

/**
 * Ícone circular flutuante no canto da tela.
 * Click para expandir o chat.
 */
export function FloatingChatBubble() {
    const { isOpen, toggle } = useFloatingChat();

    // Não mostra o bubble quando o chat está aberto
    if (isOpen) return null;

    return (
        <button
            onClick={toggle}
            className="fixed bottom-20 right-6 z-[9999] w-14 h-14 rounded-full bg-indigo-600 text-white shadow-lg hover:bg-indigo-700 hover:scale-110 active:scale-95 transition-all duration-200 flex items-center justify-center group"
            aria-label="Abrir chat"
        >
            {/* Chat icon */}
            <svg
                className="w-6 h-6 group-hover:scale-110 transition-transform"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
            >
                <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z"
                />
            </svg>

            {/* Pulse animation ring */}
            <span className="absolute inset-0 rounded-full bg-indigo-400 animate-ping opacity-20"></span>
        </button>
    );
}

export default FloatingChatBubble;
