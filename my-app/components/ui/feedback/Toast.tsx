import React, { useEffect, useState, useLayoutEffect, useRef, useCallback } from 'react';
import {
    MdCheckCircle,
    MdError,
    MdInfo,
    MdWarning,
    MdClose
} from 'react-icons/md';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

interface ToastProps {
    id: string;
    type: ToastType;
    message: string;
    title?: string;
    duration?: number;
    onClose: () => void;
}

export function Toast({ id, type, message, title, duration = 5000, onClose }: ToastProps) {
    const [isExiting, setIsExiting] = useState(false);
    const startTimeRef = useRef<number>(0);

    useLayoutEffect(() => {
        startTimeRef.current = performance.now();
    }, []);

    const onCloseRef = useRef(onClose);
    onCloseRef.current = onClose;

    const handleClose = useCallback(() => {
        const now = performance.now();
        const elapsed = now - startTimeRef.current;
        
        // Proteção contra disparos prematuros do React Lifecycle
        if (elapsed < 100) return;

        setIsExiting(true);
        // Sincronizado com a transição CSS (0.4s)
        setTimeout(() => {
            onCloseRef.current();
        }, 400);
    }, [id]);

    useEffect(() => {
        const autoCloseTimer = setTimeout(handleClose, duration);
        return () => clearTimeout(autoCloseTimer);
    }, [duration, handleClose]);

    const icons = {
        success: <MdCheckCircle className="w-6 h-6 text-emerald-500" />,
        error: <MdError className="w-6 h-6 text-red-500" />,
        info: <MdInfo className="w-6 h-6 text-blue-500" />,
        warning: <MdWarning className="w-6 h-6 text-amber-500" />,
    };

    return (
        <div
            className={`
                relative pointer-events-auto flex items-center gap-4 p-4 rounded-2xl border shadow-2xl backdrop-blur-xl transition-all duration-400
                ${isExiting ? 'opacity-0 scale-95 translate-x-10' : 'opacity-100 scale-100 translate-x-0'}
                animate-in fade-in slide-in-from-right-8 duration-500 ease-out
                
                /* Temas Base */
                bg-white/90 border-gray-200/50 
                dark:bg-zinc-900/90 dark:border-zinc-800/50
                
                /* Variantes por Tipo */
                ${type === 'success' ? 'border-emerald-500/20 bg-emerald-50/95 dark:bg-emerald-950/30' : ''}
                ${type === 'error' ? 'border-red-500/20 bg-red-50/95 dark:bg-red-950/30' : ''}
                ${type === 'warning' ? 'border-amber-500/20 bg-amber-50/95 dark:bg-amber-950/30' : ''}
                ${type === 'info' ? 'border-blue-500/20 bg-blue-50/95 dark:bg-blue-950/30' : ''}
                
                min-w-[350px] max-w-[450px]
            `}
        >
            <div className={`
                flex-shrink-0 p-2 rounded-xl shadow-sm border
                bg-white dark:bg-zinc-800/50 border-gray-100 dark:border-zinc-700/50
            `}>
                {icons[type]}
            </div>

            <div className="flex-1 min-w-0">
                {title && (
                    <h4 className={`
                        text-sm font-extrabold mb-0.5 tracking-tight uppercase
                        ${type === 'success' ? 'text-emerald-700 dark:text-emerald-400' : ''}
                        ${type === 'error' ? 'text-red-700 dark:text-red-400' : ''}
                        ${type === 'warning' ? 'text-amber-700 dark:text-amber-400' : ''}
                        ${type === 'info' ? 'text-blue-700 dark:text-blue-400' : ''}
                    `}>
                        {title}
                    </h4>
                )}
                <p className="text-sm font-medium text-gray-700 dark:text-zinc-300 leading-relaxed">
                    {message}
                </p>
            </div>

            <button
                onClick={handleClose}
                className="flex-shrink-0 p-1.5 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 transition-colors text-gray-400 hover:text-gray-900 dark:hover:text-white"
            >
                <MdClose className="w-5 h-5" />
            </button>
        </div>
    );
}
