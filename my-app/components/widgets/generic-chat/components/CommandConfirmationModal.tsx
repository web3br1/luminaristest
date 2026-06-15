import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';

export interface CommandConfirmationModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => void;
    proposal: {
        id: string;
        action: 'CREATE' | 'UPDATE' | 'DELETE';
        tableName: string;
        tableLabel: string;
        data: Record<string, unknown>;
    };
}

export function CommandConfirmationModal({ isOpen, onClose, onConfirm, proposal }: CommandConfirmationModalProps) {
    // Bloquear scroll do body quando o modal estiver aberto
    useEffect(() => {
        if (isOpen) {
            document.body.style.overflow = 'hidden';
        } else {
            document.body.style.overflow = 'unset';
        }
        return () => {
            document.body.style.overflow = 'unset';
        };
    }, [isOpen]);

    if (!isOpen) return null;

    const getActionLabel = () => {
        switch (proposal.action) {
            case 'CREATE': return 'Confirmar Novo Registro';
            case 'UPDATE': return 'Confirmar Alterações';
            case 'DELETE': return 'Confirmar Exclusão';
            default: return 'Confirmar Ação';
        }
    };

    const getActionTheme = () => {
        switch (proposal.action) {
            case 'CREATE': return { color: 'text-emerald-500', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' };
            case 'UPDATE': return { color: 'text-blue-500', bg: 'bg-blue-500/10', border: 'border-blue-500/20' };
            case 'DELETE': return { color: 'text-rose-500', bg: 'bg-rose-500/10', border: 'border-rose-500/20' };
            default: return { color: 'text-indigo-500', bg: 'bg-indigo-500/10', border: 'border-indigo-500/20' };
        }
    };

    const theme = getActionTheme();

    // Portal para renderizar fora do container do chat
    const modalContent = (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-zinc-950/80 backdrop-blur-md animate-in fade-in duration-300 p-4">
            <div className="w-full max-w-xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
                {/* Header */}
                <div className="px-6 py-5 border-b border-zinc-100 dark:border-zinc-800 flex items-center justify-between bg-zinc-50/50 dark:bg-zinc-900/50">
                    <div className="flex items-center gap-4">
                        <div className={`p-2.5 rounded-xl ${theme.bg} ${theme.color}`}>
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
                            </svg>
                        </div>
                        <div>
                            <h3 className="text-zinc-900 dark:text-white font-bold text-xl leading-tight">{getActionLabel()}</h3>
                            <p className="text-zinc-500 dark:text-zinc-400 text-sm mt-0.5">Tabela Selecionada: <span className="font-semibold text-zinc-900 dark:text-zinc-100">{proposal.tableLabel}</span></p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-all">
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* Content */}
                <div className="px-6 py-8 overflow-y-auto max-h-[65vh] chat-scrollbar">
                    <div className="space-y-6">
                        <div className="bg-zinc-50 dark:bg-zinc-800/50 rounded-2xl p-6 border border-zinc-100 dark:border-zinc-800 shadow-sm transition-all hover:border-zinc-200 dark:hover:border-zinc-700">
                            <h4 className="text-sm font-bold text-zinc-400 dark:text-zinc-500 uppercase tracking-widest mb-4">Dados da Operação</h4>
                            <div className="grid gap-y-4">
                                {Object.entries(proposal.data).map(([key, value]) => (
                                    <div key={key} className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-4 pb-3 border-b border-zinc-100 dark:border-zinc-800 last:border-0 last:pb-0">
                                        <span className="text-zinc-500 dark:text-zinc-400 text-sm font-medium sm:w-1/3 shrink-0 capitalize">
                                            {key.replace(/([A-Z])/g, ' $1').trim()}
                                        </span>
                                        <span className="text-zinc-900 dark:text-zinc-100 text-sm font-semibold break-words sm:w-2/3">
                                            {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="bg-amber-50 dark:bg-amber-500/5 border border-amber-200 dark:border-amber-500/20 rounded-2xl p-4 flex gap-4 shadow-sm">
                            <div className="p-2 bg-amber-100 dark:bg-amber-500/10 rounded-full h-fit">
                                <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-amber-600 dark:text-amber-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                                </svg>
                            </div>
                            <div>
                                <h5 className="text-amber-800 dark:text-amber-400 font-bold text-sm">Atenção</h5>
                                <p className="text-amber-700/80 dark:text-amber-500/70 text-xs leading-relaxed mt-0.5">
                                    Esta ação alterará registros reais no banco de dados. Verifique cuidadosamente os campos acima antes de prosseguir com a execução.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="px-6 py-5 bg-zinc-50 dark:bg-zinc-900 border-t border-zinc-100 dark:border-zinc-800 flex flex-col sm:flex-row gap-3 sm:justify-end">
                    <button
                        onClick={onClose}
                        className="w-full sm:w-auto px-6 py-2.5 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-200/50 dark:hover:bg-zinc-800 rounded-xl transition-all text-sm font-bold order-2 sm:order-1"
                    >
                        Revisar Novamente
                    </button>
                    <button
                        onClick={onConfirm}
                        className="w-full sm:w-auto px-8 py-2.5 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white rounded-xl shadow-lg shadow-indigo-500/25 transition-all text-sm font-bold order-1 sm:order-2"
                    >
                        Confirmar e Aplicar
                    </button>
                </div>
            </div>

            <style jsx>{`
                .animate-in {
                    animation: fade-in 0.25s ease-out;
                }
                .zoom-in-95 {
                    animation: zoom-in 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
                }
                @keyframes fade-in {
                    from { opacity: 0; }
                    to { opacity: 1; }
                }
                @keyframes zoom-in {
                    from { transform: scale(0.96); opacity: 0; }
                    to { transform: scale(1); opacity: 1; }
                }
                .chat-scrollbar::-webkit-scrollbar {
                    width: 6px;
                }
                .chat-scrollbar::-webkit-scrollbar-track {
                    background: transparent;
                }
                .chat-scrollbar::-webkit-scrollbar-thumb {
                    background: rgba(0, 0, 0, 0.1);
                    border-radius: 10px;
                }
                .dark .chat-scrollbar::-webkit-scrollbar-thumb {
                    background: rgba(255, 255, 255, 0.1);
                }
            `}</style>
        </div>
    );

    // Renderiza o modal no final do body
    return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : null;
}
