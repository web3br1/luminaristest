'use client';

import React, { useRef, useEffect, useCallback, useState } from 'react';
import { useFloatingChat } from './FloatingChatProvider';
import GenericChatWidget from '../widgets/generic-chat/components/GenericChatWidget';

const MIN_WIDTH = 320;
const MIN_HEIGHT = 400;
const MAX_WIDTH = 600;
const MAX_HEIGHT = 800;
const DEFAULT_WIDTH = 380;
const DEFAULT_HEIGHT = 500;

/**
 * Janela flutuante do chat - arrastável e redimensionável.
 */
export function FloatingChatWindow() {
    const { isOpen, position, updatePosition, close } = useFloatingChat();
    const windowRef = useRef<HTMLDivElement>(null);
    const isDraggingRef = useRef(false);
    const isResizingRef = useRef(false);
    const dragStartPos = useRef({ x: 0, y: 0 });
    const currentPos = useRef({ x: 0, y: 0 });
    const [size, setSize] = useState({ width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT });
    const resizeStartSize = useRef({ width: DEFAULT_WIDTH, height: DEFAULT_HEIGHT });
    const [isAnimating, setIsAnimating] = useState(false);
    const [shouldRender, setShouldRender] = useState(false);

    // Handle mount/unmount animations
    useEffect(() => {
        if (isOpen) {
            setShouldRender(true);
            currentPos.current = { x: position.x, y: position.y };
            requestAnimationFrame(() => setIsAnimating(true));
        } else {
            setIsAnimating(false);
            const timer = setTimeout(() => setShouldRender(false), 200);
            return () => clearTimeout(timer);
        }
    }, [isOpen, position.x, position.y]);

    // Ensure position is within viewport on mount
    useEffect(() => {
        if (typeof window !== 'undefined' && isOpen) {
            const maxX = window.innerWidth - size.width - 20;
            const maxY = window.innerHeight - size.height - 20;

            const boundedX = Math.max(20, Math.min(position.x, maxX));
            const boundedY = Math.max(20, Math.min(position.y, maxY));

            if (boundedX !== position.x || boundedY !== position.y) {
                updatePosition({ x: boundedX, y: boundedY });
            }
            currentPos.current = { x: boundedX, y: boundedY };
        }
    }, [isOpen, size.width, size.height]);

    // DRAG HANDLERS
    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        if (!(e.target as HTMLElement).closest('.chat-header')) return;
        if ((e.target as HTMLElement).closest('.resize-handle')) return;

        e.preventDefault();
        isDraggingRef.current = true;
        dragStartPos.current = { x: e.clientX, y: e.clientY };

        if (windowRef.current) {
            windowRef.current.style.transition = 'none';
        }
    }, []);

    const handleMouseMove = useCallback((e: MouseEvent) => {
        // DRAG
        if (isDraggingRef.current && windowRef.current) {
            const deltaX = e.clientX - dragStartPos.current.x;
            const deltaY = e.clientY - dragStartPos.current.y;

            let newX = position.x + deltaX;
            let newY = position.y + deltaY;

            const maxX = window.innerWidth - size.width - 10;
            const maxY = window.innerHeight - size.height - 10;
            newX = Math.max(10, Math.min(newX, maxX));
            newY = Math.max(10, Math.min(newY, maxY));

            windowRef.current.style.left = `${newX}px`;
            windowRef.current.style.top = `${newY}px`;

            currentPos.current = { x: newX, y: newY };
        }

        // RESIZE
        if (isResizingRef.current && windowRef.current) {
            const deltaX = e.clientX - dragStartPos.current.x;
            const deltaY = e.clientY - dragStartPos.current.y;

            let newWidth = resizeStartSize.current.width + deltaX;
            let newHeight = resizeStartSize.current.height + deltaY;

            newWidth = Math.max(MIN_WIDTH, Math.min(newWidth, MAX_WIDTH));
            newHeight = Math.max(MIN_HEIGHT, Math.min(newHeight, MAX_HEIGHT));

            windowRef.current.style.width = `${newWidth}px`;
            windowRef.current.style.height = `${newHeight}px`;

            setSize({ width: newWidth, height: newHeight });
        }
    }, [position.x, position.y, size.width, size.height]);

    const handleMouseUp = useCallback(() => {
        if (isDraggingRef.current) {
            isDraggingRef.current = false;
            if (windowRef.current) {
                windowRef.current.style.transition = '';
            }
            updatePosition(currentPos.current);
        }

        if (isResizingRef.current) {
            isResizingRef.current = false;
            if (windowRef.current) {
                windowRef.current.style.transition = '';
            }
        }
    }, [updatePosition]);

    // RESIZE HANDLER
    const handleResizeMouseDown = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        isResizingRef.current = true;
        dragStartPos.current = { x: e.clientX, y: e.clientY };
        resizeStartSize.current = { ...size };

        if (windowRef.current) {
            windowRef.current.style.transition = 'none';
        }
    }, [size]);

    // Add global mouse listeners
    useEffect(() => {
        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [handleMouseMove, handleMouseUp]);

    if (!shouldRender) return null;

    return (
        <div
            ref={windowRef}
            className={`fixed z-[9999] rounded-xl overflow-hidden transition-all duration-200 ${isAnimating ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
                }`}
            style={{
                left: position.x,
                top: position.y,
                width: size.width,
                height: size.height,
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
            }}
            onMouseDown={handleMouseDown}
        >
            {/* Draggable header */}
            <div
                className="chat-header h-10 bg-gradient-to-r from-blue-600 to-indigo-600 flex items-center justify-between px-3 cursor-grab active:cursor-grabbing select-none"
            >
                <div className="flex items-center gap-2">
                    <svg className="w-5 h-5 text-white/80" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                    </svg>
                    <span className="text-white font-medium text-sm">Chat Assistente</span>
                </div>

                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        close();
                    }}
                    className="p-1.5 rounded hover:bg-white/20 transition-colors"
                    aria-label="Minimizar chat"
                >
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                </button>
            </div>

            {/* Chat content */}
            <div className="h-[calc(100%-40px)] bg-white dark:bg-zinc-800">
                <GenericChatWidget
                    id="floating-chat-instance"
                    title="Chat"
                    inputPlaceholder="Pergunte algo..."
                />
            </div>

            {/* Resize handle (bottom-right corner) */}
            <div
                className="resize-handle absolute bottom-0 right-0 w-4 h-4 cursor-se-resize"
                onMouseDown={handleResizeMouseDown}
            >
                <svg
                    className="w-4 h-4 text-gray-400 dark:text-gray-600"
                    viewBox="0 0 24 24"
                    fill="currentColor"
                >
                    <path d="M22 22H20V20H22V22ZM22 18H18V22H20V20H22V18ZM14 22H18V18H22V14H18V18H14V22ZM14 22V18H10V22H14Z" />
                </svg>
            </div>
        </div>
    );
}

export default FloatingChatWindow;
