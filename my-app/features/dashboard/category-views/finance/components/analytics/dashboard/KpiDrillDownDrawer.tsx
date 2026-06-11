import React, { useState } from 'react';
import { MdClose, MdLayers } from 'react-icons/md';
import { useDrillDownData } from '../../../hooks/analytics/useDrillDownData';
import { useRelationLookups } from '../../../../../shared/hooks/useRelationLookups';
import TableView from './TableView';

interface KpiDrillDownDrawerProps {
    isOpen: boolean;
    onClose: () => void;
    tableId: string;
    recordIds: string[];
    kpiName?: string;
}

export default function KpiDrillDownDrawer({ isOpen, onClose, tableId, recordIds, kpiName }: KpiDrillDownDrawerProps) {
    const [page, setPage] = useState(1);
    const limit = 25; // Use 25 to closely match generic table pagination

    // Pass empty fields array to fetch all schema fields for the generic view
    const { data, schema, pagination, loading, error } = useDrillDownData(
        isOpen ? tableId : undefined,
        isOpen ? recordIds : undefined,
        [],
        page,
        limit
    );

    const { relationLookup } = useRelationLookups(schema?.schema, data);

    if (!isOpen) return null;

    // We can extract schema fields if the backend provides them
    // KpiDrillDownData now returns `schema`, we can use `schema.fields`
    const schemaFields = schema?.schema?.fields || [];

    return (
        <div className="fixed inset-0 z-[60] flex justify-end">
            {/* Backdrop */}
            <div
                className="absolute inset-0 bg-black/20 dark:bg-black/60 backdrop-blur-sm transition-opacity"
                onClick={onClose}
            />

            {/* Sidebar Content (Width: 3/4 of screen for large tables) */}
            <div className="relative w-full max-w-5xl h-full bg-white dark:bg-neutral-950 shadow-2xl border-l border-gray-200 dark:border-gray-800 flex flex-col transform transition-transform duration-300 animate-slide-in-right">

                {/* Header */}
                <header className="p-6 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between bg-gray-50/50 dark:bg-neutral-900/30">
                    <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
                            <MdLayers size={22} />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-gray-900 dark:text-white tracking-tight">
                                Registros Brutos (Drill-Down)
                            </h2>
                            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mt-1 flex items-center gap-2">
                                <span>{kpiName || 'Composição do KPI'}</span>
                                {pagination && (
                                    <>
                                        <span className="w-1 h-1 rounded-full bg-gray-300 dark:bg-neutral-700" />
                                        <span className="text-indigo-600 dark:text-indigo-400 font-bold">
                                            {pagination.totalRecords} encontrados
                                        </span>
                                    </>
                                )}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2.5 rounded-xl hover:bg-gray-200 dark:hover:bg-neutral-800 text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
                        title="Fechar painel"
                    >
                        <MdClose size={24} />
                    </button>
                </header>

                {/* Content */}
                <div className="flex-1 overflow-auto custom-scrollbar p-6">
                    {loading && data.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full space-y-4">
                            <div className="w-8 h-8 rounded-full border-2 border-indigo-600 border-t-transparent animate-spin" />
                            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Carregando dados da tabela...</p>
                        </div>
                    ) : error ? (
                        <div className="flex flex-col items-center justify-center h-full">
                            <div className="bg-red-50 dark:bg-red-900/20 p-6 rounded-2xl max-w-md text-center border border-red-100 dark:border-red-900/30">
                                <MdClose className="w-10 h-10 text-red-500 mx-auto mb-3" />
                                <h3 className="text-sm font-bold text-red-700 dark:text-red-400 mb-1">Erro de Comunicação</h3>
                                <p className="text-sm text-red-600 dark:text-red-300">{error}</p>
                            </div>
                        </div>
                    ) : schemaFields.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-full">
                            <p className="text-sm text-gray-500 dark:text-gray-400">O Schema da tabela não pôde ser carregado.</p>
                        </div>
                    ) : (
                        <div className="h-full flex flex-col">
                            {/* We use Generic TableView, passing the schema fields and the returned records */}
                            <TableView
                                schemaFields={schemaFields}
                                records={data as unknown as any[]}
                                relationLookups={relationLookup}
                            />

                            {/* We handle pagination overriding the generic one since we do server-side pagination */}
                            {pagination && pagination.totalPages > 1 && (
                                <div className="mt-4 pt-4 border-t border-gray-100 dark:border-neutral-800 flex items-center justify-between">
                                    <span className="text-xs text-gray-500 font-medium">
                                        Página {pagination.page} de {pagination.totalPages}
                                    </span>
                                    <div className="flex gap-2">
                                        <button
                                            onClick={() => setPage(p => Math.max(1, p - 1))}
                                            disabled={page === 1}
                                            className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors ${page === 1 ? 'text-gray-400 bg-gray-100 dark:bg-neutral-900/50 cursor-not-allowed' : 'text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 shadow-sm dark:bg-neutral-800 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-700'}`}
                                        >
                                            Página Anterior
                                        </button>
                                        <button
                                            onClick={() => setPage(p => Math.min(pagination.totalPages, p + 1))}
                                            disabled={page === pagination.totalPages}
                                            className={`px-4 py-2 rounded-lg text-xs font-bold transition-colors ${page === pagination.totalPages ? 'text-gray-400 bg-gray-100 dark:bg-neutral-900/50 cursor-not-allowed' : 'text-gray-700 bg-white border border-gray-200 hover:bg-gray-50 shadow-sm dark:bg-neutral-800 dark:border-neutral-700 dark:text-neutral-200 dark:hover:bg-neutral-700'}`}
                                        >
                                            Próxima Página
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
