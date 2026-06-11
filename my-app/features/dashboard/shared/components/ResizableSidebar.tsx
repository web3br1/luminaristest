'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { useTranslation } from 'next-i18next';

interface ResizableSidebarProps {
    children: React.ReactNode;
    minWidth?: number;
    maxWidth?: number;
    defaultWidth?: number;
    position?: 'left' | 'right';
    className?: string;
    onResize?: (width: number) => void;
}

/**
 * ResizableSidebar - A generic component that provides a resizable panel
 * with a handle.
 */
export function ResizableSidebar({
    children,
    minWidth = 300,
    maxWidth = 800,
    defaultWidth = 450,
    position = 'right',
    className = '',
    onResize,
}: ResizableSidebarProps) {
    const { t } = useTranslation(['common']);
    const [width, setWidth] = useState(defaultWidth);
    const [isResizing, setIsResizing] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        setIsResizing(true);
    }, []);

    const handleMouseMove = useCallback((e: MouseEvent) => {
        if (!isResizing || !containerRef.current) return;

        const containerRect = containerRef.current.getBoundingClientRect();
        let newWidth: number;

        if (position === 'right') {
            newWidth = containerRect.right - e.clientX;
        } else {
            newWidth = e.clientX - containerRect.left;
        }

        const clampedWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));
        setWidth(clampedWidth);
        if (onResize) onResize(clampedWidth);
    }, [isResizing, minWidth, maxWidth, position, onResize]);

    const handleMouseUp = useCallback(() => {
        setIsResizing(false);
    }, []);

    useEffect(() => {
        if (isResizing) {
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
        } else {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        }
        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        };
    }, [isResizing, handleMouseMove, handleMouseUp]);

    return (
        <div
            ref={containerRef}
            className={`flex h-full overflow-hidden ${className}`}
        >
            {position === 'right' && (
                <div
                    onMouseDown={handleMouseDown}
                    className={`
                        w-1 shrink-0 cursor-col-resize transition-colors
                        hover:bg-blue-400 dark:hover:bg-blue-500
                        ${isResizing ? 'bg-blue-500' : 'bg-gray-200 dark:bg-gray-700'}
                    `}
                    title={t('sidebar.drag_to_resize', 'Drag to resize')}
                />
            )}

            <div
                className="shrink-0 flex flex-col bg-gray-50 dark:bg-neutral-950 overflow-hidden"
                style={{ width }}
            >
                {children}
            </div>

            {position === 'left' && (
                <div
                    onMouseDown={handleMouseDown}
                    className={`
                        w-1 shrink-0 cursor-col-resize transition-colors
                        hover:bg-blue-400 dark:hover:bg-blue-500
                        ${isResizing ? 'bg-blue-500' : 'bg-gray-200 dark:bg-gray-700'}
                    `}
                    title={t('sidebar.drag_to_resize', 'Drag to resize')}
                />
            )}
        </div>
    );
}
