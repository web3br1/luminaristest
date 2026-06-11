'use client';

import React from 'react';
import { FloatingChatProvider } from './FloatingChatProvider';
import { FloatingChatBubble } from './FloatingChatBubble';
import { FloatingChatWindow } from './FloatingChatWindow';

/**
 * Container principal do Floating Chat.
 * Combina Provider, Bubble e Window em um único componente.
 */
export function FloatingChatContainer() {
    return (
        <FloatingChatProvider>
            <FloatingChatBubble />
            <FloatingChatWindow />
        </FloatingChatProvider>
    );
}

export default FloatingChatContainer;
