'use client';

import React, { useMemo } from 'react';
import { useTranslation } from 'next-i18next';
import { isTableSchema, type IDynamicTable } from '@/features/dashboard/components/shared/dynamic-tables.client';
import { formatDateBR } from '@/features/dashboard/shared/utils/formatters';
import { useFormatCurrency } from '@/lib/context/CurrencyContext';
import { useConfirmModal } from '@/components/ui/feedback/useConfirmModal';
import { useRenderTypedValue } from '@/features/dashboard/shared/hooks/useRenderTypedValue';
import { StatusBadge, PaymentBadge } from './SalesTable';
import { SaleRecord, SaleItemRecord } from '../../types/sales.types';

// Convert camelCase field name to a readable label: "salesChannel" → "Sales Channel"
function formatFieldLabel(name: string): string {
    return name
        .replace(/([A-Z])/g, ' $1')
        .replace(/^./, s => s.toUpperCase())
        .trim();
}

interface SaleDetailPanelProps {
    sale: SaleRecord | null;
    table: IDynamicTable | null;
    items: SaleItemRecord[];
    computedSubtotal: number;
    isUpdating?: string | null;
    productNameMap: Record<string, string>;
    serviceNameMap: Record<string, string>;
    customerNameMap: Record<string, string>;
    unitNameMap: Record<string, string>;
    onUpdateSale: (saleId: string, payload: Record<string, unknown>, successMessage?: string) => Promise<void>;
}

export default function SaleDetailPanel({
    sale,
    table,
    items,
    computedSubtotal,
    isUpdating,
    productNameMap,
    serviceNameMap,
    customerNameMap,
    unitNameMap,
    onUpdateSale,
}: SaleDetailPanelProps) {
    const { t } = useTranslation(['finance_view', 'common']);
    const formatCurrency = useFormatCurrency();
    const renderTypedValue = useRenderTypedValue();
    const { confirmNode, confirm } = useConfirmModal();
    const filteredItems = useMemo(() => {
        if (!sale) return [];
        return items.filter((it) => String(it.saleId || '') === String(sale.id));
    }, [items, sale]);

    if (!sale) {
        return (
            <div className="rounded-xl border border-gray-200/70 dark:border-gray-800/70 bg-white dark:bg-neutral-900 p-6">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                    {t('finance_view:sales.detail_prompt', 'Selecione uma venda para ver detalhes.')}
                </p>
            </div>
        );
    }

    const statusLc = String(sale.status || '').toLowerCase();
    const paymentLc = String(sale.paymentStatus || '').toLowerCase();
    const isFinalized = statusLc === 'finalized';
    const isCancelled = statusLc === 'cancelled';
    const isPaid = paymentLc === 'paid';

    const customerName = sale.simpleCustomer
        ? sale.simpleCustomerName || '—'
        : customerNameMap[String(sale.customerId || '')] || sale.customerId || '—';

    const unitName = unitNameMap[String(sale.unitId || '')] || sale.unitId || '—';

    const subtotal = Number(sale.subtotal) || computedSubtotal || 0;
    const total = Number(sale.totalAmount) || subtotal || 0;

    return (
        <div className="rounded-xl border border-gray-200/70 dark:border-gray-800/70 bg-white dark:bg-neutral-900">
            {confirmNode}
            {/* Header */}
            <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-700 dark:text-gray-100">{t('finance_view:sales.labels.details', 'Detalhes')}</h2>
                <div className="flex gap-2">
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
                            className="text-xs px-2 py-1 rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            {t('common:finalize', 'Finalizar')}
                        </button>
                    )}
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
                            className="text-xs px-2 py-1 rounded bg-red-600 text-white hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            {t('common:cancel', 'Cancelar')}
                        </button>
                    )}
                    {!isPaid && !isCancelled && (
                        <button
                            disabled={isUpdating === sale.id}
                            onClick={() => confirm({
                                title: t('finance_view:sales.confirm_mark_paid', 'Marcar como paga?'),
                                message: t('finance_view:sales.confirm_pay_message', 'O status de pagamento desta venda será atualizado para Pago.'),
                                variant: 'info',
                                confirmLabel: t('common:pay', 'Confirmar pagamento'),
                                onConfirm: () => onUpdateSale(sale.id, { paymentStatus: 'Paid' }, t('finance_view:sales.success_paid', 'Venda paga com sucesso.'))
                            })}
                            className="text-xs px-2 py-1 rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            {t('common:pay', 'Pagar')}
                        </button>
                    )}
                </div>
            </div>

            {/* Content */}
            <div className="p-4 space-y-4">
                {/* Date & Status */}
                <div className="flex items-center justify-between">
                    <div className="space-y-1">
                        <div className="text-sm text-gray-600 dark:text-gray-400">{t('finance_view:sales.labels.date', 'Data')}</div>
                        <div className="text-sm font-medium text-gray-900 dark:text-gray-100">
                            {formatDateBR(sale.date)}
                        </div>
                    </div>
                    <div className="flex gap-2">
                        <StatusBadge status={sale.status} />
                        <PaymentBadge status={sale.paymentStatus} />
                    </div>
                </div>

                {/* Customer & Unit */}
                <div className="grid grid-cols-2 gap-4">
                    <div className="bg-gray-50 dark:bg-neutral-800 rounded-lg p-3">
                        <div className="text-xs text-gray-600 dark:text-gray-400">{t('finance_view:sales.labels.customer', 'Cliente')}</div>
                        <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{customerName}</div>
                    </div>
                    <div className="bg-gray-50 dark:bg-neutral-800 rounded-lg p-3">
                        <div className="text-xs text-gray-600 dark:text-gray-400">{t('finance_view:sales.labels.unit', 'Unidade')}</div>
                        <div className="text-sm font-medium text-gray-900 dark:text-gray-100">{unitName}</div>
                    </div>
                </div>

                {/* Subtotal & Total */}
                <div className="grid grid-cols-2 gap-4">
                    <div className="bg-gray-50 dark:bg-neutral-800 rounded-lg p-3">
                        <div className="text-xs text-gray-600 dark:text-gray-400">{t('finance_view:sales.labels.subtotal', 'Subtotal')}</div>
                        <div className="text-base font-semibold text-gray-900 dark:text-gray-100">{formatCurrency(subtotal)}</div>
                    </div>
                    <div className="bg-gray-50 dark:bg-neutral-800 rounded-lg p-3">
                        <div className="text-xs text-gray-600 dark:text-gray-400">{t('finance_view:sales.labels.total', 'Total')}</div>
                        <div className="text-base font-semibold text-gray-900 dark:text-gray-100">{formatCurrency(total)}</div>
                    </div>
                </div>

                {/* Dynamic Extra Fields — isTableSchema guard replaces (schema as any) cast */}
                {table?.schema && isTableSchema(table.schema) && (
                    <div className="space-y-3 pt-2">
                        {table.schema.fields
                            .filter(f => ![
                                'id', 'date', 'status', 'paymentStatus', 'subtotal', 'totalAmount',
                                'customerId', 'unitId', 'simpleCustomer', 'simpleCustomerName', 'notes',
                                'paymentMethod', 'paymentTermDays'
                            ].includes(f.name))
                            .map(f => {
                                // SaleData has [key: string]: unknown — cast to Record avoids `any`
                                const val = (sale as Record<string, unknown>)[f.name];
                                if (val == null || val === '') return null;
                                // Boolean → badge verde/cinza (semelhante ao GenericDataSidebar)
                                if (typeof val === 'boolean') {
                                    return (
                                        <div key={f.name} className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-800 last:border-0 hover:bg-gray-50/50 dark:hover:bg-neutral-800/30 px-1 transition-colors">
                                            <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{f.label || formatFieldLabel(f.name)}</span>
                                            <span className={`px-2 py-0.5 rounded text-xs font-medium ${val ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-gray-100 text-gray-700 dark:bg-neutral-800 dark:text-gray-400'}`}>
                                                {val ? t('common:yes', 'Sim') : t('common:no', 'Não')}
                                            </span>
                                        </div>
                                    );
                                }
                                // Demais tipos → useRenderTypedValue (locale + currency-aware via numberFormat)
                                const formatted = renderTypedValue(val, f.type, { numberFormat: f.numberFormat });
                                return (
                                    <div key={f.name} className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-gray-800 last:border-0 hover:bg-gray-50/50 dark:hover:bg-neutral-800/30 px-1 transition-colors">
                                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">{f.label || formatFieldLabel(f.name)}</span>
                                        <span className="text-sm font-semibold text-gray-900 dark:text-gray-100 flex items-center">
                                            {formatted}
                                        </span>
                                    </div>
                                );
                            })}
                    </div>
                )}

                {/* Items */}
                <div>
                    <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-2">{t('finance_view:sales.items.title', 'Itens')}</h3>
                    <div className="overflow-x-auto">
                        <table className="min-w-full text-sm text-gray-900 dark:text-gray-100">
                            <thead>
                                <tr className="text-left text-gray-600 dark:text-gray-400">
                                    <th className="px-3 py-2 font-medium">{t('finance_view:sales.items.type', 'Tipo')}</th>
                                    <th className="px-3 py-2 font-medium">{t('finance_view:sales.items.name', 'Produto/Serviço')}</th>
                                    <th className="px-3 py-2 font-medium">{t('finance_view:sales.items.quantity', 'Qtd')}</th>
                                    <th className="px-3 py-2 font-medium">{t('finance_view:sales.items.price', 'Preço')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredItems.length === 0 ? (
                                    <tr>
                                        <td className="px-3 py-4 text-gray-500 dark:text-gray-400" colSpan={4}>
                                            {t('finance_view:sales.items.none_found', 'Nenhum item.')}
                                        </td>
                                    </tr>
                                ) : (
                                    filteredItems.map((item) => {
                                        const isProduct = !!item.productId && !item.serviceId;
                                        const itemType = item.type || (isProduct ? 'Product' : 'Service');
                                        const itemName = isProduct
                                            ? productNameMap[String(item.productId)] || item.productId || '—'
                                            : serviceNameMap[String(item.serviceId)] || item.serviceId || '—';

                                        return (
                                            <tr key={item.id} className="border-t border-gray-100 dark:border-gray-800">
                                                <td className="px-3 py-2">
                                                    {t(`finance_view:sales.items.type_${(itemType || '').toLowerCase()}`, itemType)}
                                                </td>
                                                <td className="px-3 py-2">{itemName}</td>
                                                <td className="px-3 py-2">{item.quantity ?? 1}</td>
                                                <td className="px-3 py-2">{formatCurrency(Number(item.unitPrice || 0))}</td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        </div>
    );
}
