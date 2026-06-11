'use client';

import React, { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';

interface FloatingChatPosition {
    x: number;
    y: number;
}

interface FloatingChatContextType {
    isOpen: boolean;
    position: FloatingChatPosition;
    toggle: () => void;
    open: () => void;
    close: () => void;
    updatePosition: (pos: FloatingChatPosition) => void;
}

const FloatingChatContext = createContext<FloatingChatContextType | null>(null);

/**
 * Hook para acessar o contexto do floating chat
 */
export function useFloatingChat() {
    const context = useContext(FloatingChatContext);
    if (!context) {
        throw new Error('useFloatingChat deve ser usado dentro de FloatingChatProvider');
    }
    return context;
}

interface FloatingChatProviderProps {
    children: ReactNode;
}

/**
 * Provider global para o floating chat.
 * Gerencia estado de abertura e posição.
 */
export function FloatingChatProvider({ children }: FloatingChatProviderProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [position, setPosition] = useState<FloatingChatPosition>({ x: 100, y: 100 });

    // Calcula posição inicial no client side
    useEffect(() => {
        if (typeof window !== 'undefined') {
            setPosition({
                x: window.innerWidth - 400,
                y: window.innerHeight - 550
            });
        }
    }, []);

    const toggle = useCallback(() => setIsOpen(prev => !prev), []);
    const open = useCallback(() => setIsOpen(true), []);
    const close = useCallback(() => setIsOpen(false), []);
    const updatePosition = useCallback((newPos: FloatingChatPosition) => setPosition(newPos), []);

    const value: FloatingChatContextType = {
        isOpen,
        position,
        toggle,
        open,
        close,
        updatePosition,
    };

    return (
        <FloatingChatContext.Provider value={value}>
            {children}
        </FloatingChatContext.Provider>
    );
}

export default FloatingChatProvider;
