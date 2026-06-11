'use client';

import React from 'react';
import { useTranslation } from 'next-i18next';
import { HiEye, HiCheck, HiBan, HiCurrencyDollar } from 'react-icons/hi';
import { formatDateBR } from '../../utils/formatters';
import { useFormatCurrency } from '@/lib/context/CurrencyContext';
import { useConfirmModal } from '@/components/ui/feedback/useConfirmModal';
import { SaleRecord } from '../../types/sales.types';

// ─────────────────────────────────────────────────────────────
// Module-level constants
// ─────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-700 dark:bg-neutral-800 dark:text-gray-300',
    finalized: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
    cancelled: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
    returned: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
};

const PAYMENT_COLORS: Record<string, string> = {
    pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
    paid: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
    partial: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
};

// ─────────────────────────────────────────────────────────────

// Re-export para quem importar de components/sales
export type { SaleRecord };

export function StatusBadge({ status }: { status?: string }) {
    const { t } = useTranslation(['finance_view']);
    const s = String(status || '').toLowerCase();
    const label = status ? t(`finance_view:status.${s}`, status) : '—';
    return (
        <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[s] || STATUS_COLORS.draft}`}>
            {label}
        </span>
    );
}

export function PaymentBadge({ status }: { status?: string }) {
    const { t } = useTranslation(['finance_view']);
    const s = String(status || '').toLowerCase();
    const label = status ? t(`finance_view:status.${s}`, status) : '—';
    return (
        <span className={`px-2 py-0.5 rounded text-xs font-medium ${PAYMENT_COLORS[s] || PAYMENT_COLORS.pending}`}>
            {label}
        </span>
    );
}

interface SalesTableProps {
    sales: SaleRecord[];
    selectedSaleId?: string | null;
    saleIdToSubtotal: Record<string, number>;
    customerNameMap: Record<string, string>;
    isLoading?: boolean;
    isUpdating?: string | null;
    isWidgetMode?: boolean;
    onSelectSale: (sale: SaleRecord) => void;
    onUpdateSale: (saleId: string, payload: Record<string, unknown>, successMessage?: string) => Promise<void>;
    onRefresh: () => void;
}

export default function SalesTable({
    sales,
    selectedSaleId,
    saleIdToSubtotal,
    customerNameMap,
    isLoading,
    isUpdating,
    isWidgetMode = false,
    onSelectSale,
    onUpdateSale,
    onRefresh,
}: SalesTableProps) {
    const { t } = useTranslation(['finance_view', 'common']);
    const formatCurrency = useFormatCurrency();
    const { confirmNode, confirm } = useConfirmModal();

    return (
        <div className="flex flex-col flex-1 overflow-hidden bg-white dark:bg-neutral-900 shadow-sm rounded-xl">
            {confirmNode}
            {/* Header */}
            <div className="flex-none px-4 py-3 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-100">
                    {t('finance_view:sales.table.list_title', 'Lista de vendas')}
                </h2>
                <button
                    onClick={onRefresh}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-colors"
                    title={t('common:refresh', 'Atualizar')}
                >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                </button>
            </div>

            {/* Loading state */}
            {isLoading ? (
                <div className="flex flex-col items-center justify-center h-48 space-y-3">
                    <div className="w-8 h-8 border-2 border-emerald-600/30 border-t-emerald-600 rounded-full animate-spin" />
                    <p className="text-xs font-bold text-gray-400 uppercase tracking-widest">
                        {t('common:loading', 'Carregando...')}
                    </p>
                </div>
            ) : (
                /* Scrollable table — data pre-sorted and pre-paginated by useSalesLogic */
                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-800">
                        <thead className="bg-gray-100/50 dark:bg-neutral-800/50 sticky top-0 z-20 backdrop-blur-md">
                            <tr>
                                <th className="px-4 py-3 text-left text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest">
                                    {t('finance_view:sales.table.date', 'Data')}
                                </th>
                                <th className="px-4 py-3 text-left text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest">
                                    {t('finance_view:sales.table.customer', 'Cliente')}
                                </th>
                                <th className="px-4 py-3 text-left text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest">
                                    {t('finance_view:sales.table.status', 'Status')}
                                </th>
                                <th className="px-4 py-3 text-left text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest">
                                    {t('finance_view:sales.table.payment', 'Pagamento')}
                                </th>
                                <th className="px-4 py-3 text-right text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest">
                                    {t('finance_view:sales.table.subtotal', 'Subtotal')}
                                </th>
                                <th className="px-4 py-3 text-right text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest">
                                    {t('finance_view:sales.table.total', 'Total')}
                                </th>
                                {!isWidgetMode && (
                                    <th className="px-4 py-3 text-right text-[10px] font-black text-gray-500 dark:text-gray-400 uppercase tracking-widest">
                                        {t('finance_view:sales.table.actions', 'Ações')}
                                    </th>
                                )}
                            </tr>
                        </thead>
                        <tbody className="bg-white dark:bg-neutral-900 divide-y divide-gray-200 dark:divide-gray-800">
                            {sales.length === 0 ? (
                                <tr>
                                    <td colSpan={isWidgetMode ? 6 : 7} className="py-16 text-center text-sm text-gray-400">
                                        {t('finance_view:sales.empty', 'Nenhuma venda encontrada.')}
                                    </td>
                                </tr>
                            ) : (
                                sales.map((sale) => {
                                    const isSelected = selectedSaleId === sale.id;
                                    const statusLc = String(sale.status || '').toLowerCase();
                                    const paymentLc = String(sale.paymentStatus || '').toLowerCase();
                                    const isFinalized = statusLc === 'finalized';
                                    const isCancelled = statusLc === 'cancelled';
                                    const isPaid = paymentLc === 'paid';

                                    const computedSubtotal = saleIdToSubtotal[sale.id] ?? 0;
                                    const dbSubtotal = Number(sale.subtotal);
                                    const subtotal = isFinite(dbSubtotal) && dbSubtotal > 0 ? dbSubtotal : computedSubtotal;
                                    const dbTotal = Number(sale.totalAmount);
                                    const discount = Number(sale.discountAmount ?? 0);
                                    const total = isFinite(dbTotal) && dbTotal > 0 ? dbTotal : Math.max(0, subtotal - discount);

                                    const customerName = sale.simpleCustomer
                                        ? String(sale.simpleCustomerName || '—')
                                        : customerNameMap[String(sale.customerId || '')] || '—';

                                    return (
                                        <tr
                                            key={sale.id}
                                            onClick={() => onSelectSale(sale)}
                                            className={`hover:bg-gray-50 dark:hover:bg-neutral-800/50 transition-colors cursor-pointer border-l-2 ${isSelected
                                                ? 'bg-blue-50 dark:bg-blue-900/20 border-l-blue-500'
                                                : 'border-l-transparent'
                                            }`}
                                        >
                                            <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-gray-100">
                                                {formatDateBR(sale.date)}
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap">
                                                <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                                                    {customerName}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap text-sm">
                                                <StatusBadge status={sale.status} />
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap text-sm">
                                                <PaymentBadge status={sale.paymentStatus} />
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap text-base font-semibold text-right text-gray-700 dark:text-gray-300">
                                                {formatCurrency(subtotal)}
                                            </td>
                                            <td className="px-4 py-3 whitespace-nowrap text-base text-right font-bold text-gray-900 dark:text-white">
                                                {formatCurrency(total)}
                                            </td>
                                            {!isWidgetMode && (
                                            <td className="px-4 py-3 whitespace-nowrap text-right text-sm font-medium">
                                                <div className="flex items-center justify-end gap-2" onClick={e => e.stopPropagation()}>
                                                    {/* Ver Detalhes — sempre visível */}
                                                    <button
                                                        onClick={() => onSelectSale(sale)}
                                                        title={t('common:view_details', 'Ver Detalhes')}
                                                        className="p-1.5 rounded-lg bg-gray-100 dark:bg-neutral-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                                                    >
                                                        <HiEye size={18} />
                                                    </button>

                                                    {/* Finalizar — só se não finalizado e não cancelado */}
                                                    {!isFinalized && !isCancelled && (
                                                        <button
                                                            disabled={isUpdating === sale.id}
                                                            onClick={() => confirm({
                                                                title: t('finance_view:sales.confirm_finalize', 'Finalizar venda?'),
                                                                message: t('finance_view:sales.confirm_finalize_message', 'A venda será marcada como finalizada.'),
                                                                variant: 'info',
                                                                confirmLabel: t('common:finalize', 'Finalizar'),
                                                                onConfirm: () => onUpdateSale(sale.id, { status: 'Finalized' }, t('finance_view:sales.success_finalized', 'Venda finalizada com sucesso.'))
                                                            })}
                                                            title={t('common:finalize', 'Finalizar')}
                                                            className="p-1.5 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                                        >
                                                            <HiCheck size={18} />
                                                        </button>
                                                    )}

                                                    {/* Cancelar — só se não cancelado */}
                                                    {!isCancelled && (
                                                        <button
                                                            disabled={isUpdating === sale.id}
                                                            onClick={() => confirm({
                                                                title: t('finance_view:sales.confirm_cancel', 'Cancelar venda?'),
                                                                message: t('finance_view:sales.confirm_cancel_message', 'Esta ação não pode ser desfeita. A venda será marcada como cancelada.'),
                                                                variant: 'danger',
                                                                confirmLabel: t('common:cancel', 'Cancelar venda'),
                                                                onConfirm: () => onUpdateSale(sale.id, { status: 'Cancelled' }, t('finance_view:sales.success_cancelled', 'Venda cancelada com sucesso.'))
                                                            })}
                                                            title={t('common:cancel', 'Cancelar')}
                                                            className="p-1.5 rounded-lg bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                                        >
                                                            <HiBan size={18} />
                                                        </button>
                                                    )}

                                                    {/* Pagar — só se não pago e não cancelado */}
                                                    {!isPaid && !isCancelled && (
                                                        <button
                                                            disabled={isUpdating === sale.id}
                                                            onClick={() => confirm({
                                                                title: t('finance_view:sales.confirm_mark_paid', 'Marcar como paga?'),
                                                                message: t('finance_view:sales.confirm_pay_message', 'O status de pagamento será atualizado para Pago.'),
                                                                variant: 'info',
                                                                confirmLabel: t('common:pay', 'Confirmar pagamento'),
                                                                onConfirm: () => onUpdateSale(sale.id, { paymentStatus: 'Paid' }, t('finance_view:sales.success_paid', 'Venda paga com sucesso.'))
                                                            })}
                                                            title={t('common:pay', 'Pagar')}
                                                            className="p-1.5 rounded-lg bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-200 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                                        >
                                                            <HiCurrencyDollar size={18} />
                                                        </button>
                                                    )}
                                                </div>
                                            </td>
                                            )}
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
