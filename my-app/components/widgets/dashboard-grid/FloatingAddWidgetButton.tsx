'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'next-i18next';
import { HiOutlinePlus, HiOutlineChatAlt2, HiOutlineDocumentText, HiOutlineChartPie, HiOutlineTrash, HiOutlineTable } from 'react-icons/hi';
import { DASHBOARD_GRID_CONFIG } from './dashboard-grid.config';

interface FloatingAddWidgetButtonProps {
    onAddWidget: (type: string) => void;
    onClearLayout: () => void;
}

export default function FloatingAddWidgetButton({ onAddWidget, onClearLayout }: FloatingAddWidgetButtonProps) {
    const { t } = useTranslation('common');
    const [isOpen, setIsOpen] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    const widgets = [
        {
            type: DASHBOARD_GRID_CONFIG.WIDGET_TYPES.DOCUMENT_CHAT,
            label: t('dashboard.widgets.documentChat.title', 'Chat de Documentos'),
            description: t('dashboard.widgets.documentChat.description', 'Converse sobre seus arquivos'),
            icon: HiOutlineDocumentText,
        },
        {
            type: DASHBOARD_GRID_CONFIG.WIDGET_TYPES.GENERIC_CHAT,
            label: t('dashboard.widgets.genericChat.title', 'Chat'),
            description: t('dashboard.widgets.genericChat.description', 'Chat genérico expansível'),
            icon: HiOutlineChatAlt2,
        },
        {
            type: DASHBOARD_GRID_CONFIG.WIDGET_TYPES.KPI,
            label: t('dashboard.widgets.kpi.title', 'Métrica (KPI)'),
            description: t('dashboard.widgets.kpi.description', 'Exiba análises e gráficos'),
            icon: HiOutlineChartPie,
        },
        {
            type: DASHBOARD_GRID_CONFIG.WIDGET_TYPES.ERP_VIEW,
            label: t('dashboard.widgets.erpView.title', 'Visualização ERP'),
            description: t('dashboard.widgets.erpView.description', 'Exiba uma tabela do sistema'),
            icon: HiOutlineTable,
        },
    ];

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        }
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    function handleDragStart(event: React.DragEvent, type: string) {
        event.dataTransfer.effectAllowed = 'copy';
        event.dataTransfer.setData('application/react-widget-type', type);
        event.dataTransfer.setData('text/plain', type);
    }

    return (
        <div className="fixed bottom-8 right-8 z-50 flex flex-col items-end" ref={menuRef}>
            {/* Popover Menu */}
            <div
                className={`mb-3 w-72 origin-bottom-right transition-all duration-200 ease-out transform ${isOpen ? 'scale-100 opacity-100 translate-y-0' : 'scale-95 opacity-0 translate-y-2 pointer-events-none'
                    }`}
            >
                <div className="bg-white/95 dark:bg-neutral-900/95 backdrop-blur-xl border border-gray-200/60 dark:border-gray-800/60 rounded-lg shadow-2xl overflow-hidden p-1">
                    <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-800/60 mb-1">
                        <h3 className="text-[10px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest">
                            {t('dashboard.widgets.addTitle', 'Adicionar Widget')}
                        </h3>
                    </div>

                    <div className="max-h-[60vh] overflow-y-auto custom-scrollbar p-1 space-y-1">
                        {widgets.map((widget) => {
                            const Icon = widget.icon;
                            return (
                                <button
                                    key={widget.type}
                                    draggable
                                    onDragStart={(e) => handleDragStart(e, widget.type)}
                                    onClick={() => {
                                        onAddWidget(widget.type);
                                        setIsOpen(false);
                                    }}
                                    className="w-full flex items-start gap-4 p-3 rounded-lg text-left transition-all duration-200 hover:bg-black/5 dark:hover:bg-white/5 group relative overflow-hidden"
                                >
                                    <div className="mt-0.5 opacity-80 group-hover:opacity-100 transition-opacity">
                                        <Icon className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                                    </div>
                                    <div className="flex flex-col">
                                        <h4 className="text-xs font-bold text-gray-800 dark:text-gray-200">
                                            {widget.label}
                                        </h4>
                                        <p className="text-[10px] text-gray-500 dark:text-gray-500 font-medium mt-0.5 line-clamp-1">
                                            {widget.description}
                                        </p>
                                    </div>
                                </button>
                            );
                        })}
                    </div>

                    <div className="p-1 border-t border-gray-100 dark:border-gray-800/60 mt-1">
                        <button
                            onClick={() => {
                                onClearLayout();
                                setIsOpen(false);
                            }}
                            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-[11px] font-bold text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/10 rounded-lg transition-all"
                        >
                            <HiOutlineTrash className="w-4 h-4" />
                            {t('dashboard.widgets.clearLayout', 'Limpar Layout')}
                        </button>
                    </div>
                </div>
            </div>

            {/* Main Floating Button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={`flex items-center justify-center w-12 h-12 rounded-lg shadow-lg active:scale-95 transition-all duration-300 ${isOpen
                    ? 'bg-red-500 rotate-45 text-white shadow-red-500/20'
                    : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-600/20'
                    }`}
                aria-label="Toggle Widget Menu"
            >
                <HiOutlinePlus className={`w-6 h-6 transition-transform duration-300 ${isOpen ? 'rotate-0' : ''}`} />
            </button>
        </div>
    );
}
