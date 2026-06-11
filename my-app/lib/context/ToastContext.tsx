import React, { createContext, useContext, useState, useCallback, useEffect, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Toast, ToastType } from '../../components/ui/feedback/Toast';

interface ToastMessage {
    id: string;
    type: ToastType;
    message: string;
    title?: string;
}

interface ToastContextType {
    showToast: (message: string, type?: ToastType, title?: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
    const [toasts, setToasts] = useState<ToastMessage[]>([]);
    // SSR guard — createPortal precisa de document.body (não existe no servidor)
    const [mounted, setMounted] = useState(false);

    const showToast = useCallback((message: string, type: ToastType = 'info', title?: string) => {
        const id = Math.random().toString(36).substring(2, 9);
        setToasts((prev) => [...prev, { id, type, message, title }]);
    }, []);

    const removeToast = useCallback((id: string) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    }, []);

    useEffect(() => {
        setMounted(true);
    }, []);

    // Escuta eventos globais de notificação (disparados por apiClient, services, etc.)
    useEffect(() => {
        const handler = (e: Event) => {
            const { message, type, title } = (e as CustomEvent).detail;
            showToast(message, type ?? 'info', title);
        };
        window.addEventListener('app:notify', handler);
        return () => {
            window.removeEventListener('app:notify', handler);
        };
    }, [showToast]);

    return (
        <ToastContext.Provider value={{ showToast }}>
            {children}
            {/* Portal garante que o toast escapa de qualquer stacking context pai
                (transform, filter, will-change) — mesmo padrão do ConfirmModal */}
            {mounted && createPortal(
                <div
                    id="global-toast-container"
                    className="fixed bottom-6 right-6 z-[9999] flex flex-col gap-3 pointer-events-none items-end"
                    style={{ width: 'min(420px, calc(100vw - 48px))' }}
                >
                    {toasts.map((toast) => (
                        <Toast
                            key={toast.id}
                            id={toast.id}
                            type={toast.type}
                            message={toast.message}
                            title={toast.title}
                            onClose={() => removeToast(toast.id)}
                        />
                    ))}
                </div>,
                document.body
            )}
        </ToastContext.Provider>
    );
}

export function useToast() {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error('useToast must be used within a ToastProvider');
    }
    return context;
}
