'use client';

/**
 * MovementModal - Modal de movimentação de estoque
 * 
 * @description
 * Componente extraído do InternalInventoryView para melhor modularização.
 * Gerencia entradas e saídas de estoque com suporte a fornecedores.
 */

import React, { useState, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'next-i18next';
import { useCurrency, SUPPORTED_CURRENCIES } from '@/lib/context/CurrencyContext';
import { MdSwapHoriz, MdInfo, MdAdd, MdRemove } from 'react-icons/md';
import RelationSelector from '../../../components/forms/RelationSelector';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export type MovementType = 'In' | 'Out';
export type MovementReason = 'Purchase' | 'Sale' | 'Internal Use' | 'Return' | 'Adjustment';

export interface MovementRow {
    id: string;
    data: {
        productId?: string;
        unitId?: string;
        productName?: string;
        unitName?: string;
        [key: string]: unknown;
    };
}

interface MovementModalProps {
    isOpen: boolean;
    row: MovementRow | null;
    suppliersTableId: string | null;
    onClose: () => void;
    onCreateMovement: (body: Record<string, unknown>) => Promise<void>;
    onSuccess: () => void;
}

// ─────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────

export function MovementModal({
    isOpen,
    row,
    suppliersTableId,
    onClose,
    onCreateMovement,
    onSuccess,
}: MovementModalProps) {
    const { t } = useTranslation(['inventory_view', 'common']);
    const { currency } = useCurrency();
    const currencyInfo = SUPPORTED_CURRENCIES.find(c => c.code === currency) ?? SUPPORTED_CURRENCIES[0];
    const activeLocale = currencyInfo.locale;
    const activeCurrency = currencyInfo.symbol;

    const formatCurrencyInput = useCallback((value: string): string => {
        const digits = value.replace(/\D/g, '');
        const number = parseInt(digits || '0', 10);
        return (number / 100).toLocaleString(activeLocale, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        });
    }, [activeLocale]);
    // Modal State
    const [movementType, setMovementType] = useState<MovementType>('In');
    const [movementReason, setMovementReason] = useState<MovementReason>('Purchase');
    const [movementQty, setMovementQty] = useState<number>(0);
    const [movementCost, setMovementCost] = useState<string>('');
    const [movementSupplier, setMovementSupplier] = useState<string>('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    // Handlers
    const handleQuantityChange = useCallback((value: string) => {
        const clean = value.replace(/[^0-9]/g, '');
        setMovementQty(parseInt(clean || '0', 10));
    }, []);

    const incrementQty = useCallback(() => setMovementQty(q => q + 1), []);
    const decrementQty = useCallback(() => setMovementQty(q => Math.max(0, q - 1)), []);

    const handleRegisterMovement = useCallback(async () => {
        if (!row) return;

        try {
            setIsSubmitting(true);
            setError(null);

            const data = row.data;
            const productId = String(data.productId || '');
            const unitId = String(data.unitId || '');

            if (!productId || !unitId) throw new Error(t('inventory_view:modal.error_invalid_info', 'Informações de produto/unidade inválidas.'));
            if (movementQty <= 0) throw new Error(t('inventory_view:modal.error_qty_zero', 'Quantidade deve ser maior que zero.'));

            const finalCost = movementType === 'In' ? (() => {
                const usesCommaDecimal = activeLocale === 'pt-BR' || activeLocale === 'de-DE';
                return parseFloat(
                    movementCost
                        .replace(/[^\d.,-]/g, '')
                        .replace(usesCommaDecimal ? /\./g : /,/g, '')
                        .replace(usesCommaDecimal ? /,/g : /\./g, '.')
                ) || 0;
            })() : 0;

            if (movementType === 'In' && movementReason === 'Purchase' && (!movementSupplier || !finalCost || finalCost <= 0)) {
                throw new Error(t('inventory_view:modal.error_purchase_req', 'Fornecedor e valor total são obrigatórios para compras.'));
            }

            const body: Record<string, unknown> = {
                productId,
                unitId,
                type: movementType,
                quantity: movementQty,
                date: new Date().toISOString(),
                reason: movementReason,
                sourceType: 'UI_INVENTORY_MANAGER'
            };

            if (movementType === 'In') {
                if (finalCost > 0) body.cost = finalCost;
                if (movementSupplier) body.supplierId = movementSupplier;
            }

            await onCreateMovement(body);

            // Reset and close
            setMovementQty(0);
            setMovementCost('');
            setMovementSupplier('');
            onClose();
            onSuccess();
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : t('inventory_view:modal.error_generic', 'Erro ao registrar movimentação.'));
        } finally {
            setIsSubmitting(false);
        }
    }, [row, movementType, movementReason, movementQty, movementCost, movementSupplier, activeLocale, onCreateMovement, onClose, onSuccess, t]);

    if (!mounted || !isOpen || !row) return null;

    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
            <div className="w-full max-w-lg bg-white dark:bg-neutral-900 rounded-3xl shadow-2xl overflow-hidden border border-gray-200 dark:border-gray-800 animate-in zoom-in-95 duration-200">
                {/* Header */}
                <div className="px-8 py-6 border-b border-gray-100 dark:border-gray-800 bg-gradient-to-r from-blue-600/5 to-transparent flex items-center justify-between">
                    <div>
                        <h3 className="text-xl font-black text-gray-900 dark:text-white uppercase tracking-tight">{t('inventory_view:modal.title', 'Nova Movimentação')}</h3>
                        <p className="text-[10px] font-bold text-blue-500 uppercase tracking-widest mt-1">
                            {row.data.productName} • {row.data.unitName}
                        </p>
                    </div>
                    <div className="p-3 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-2xl shadow-inner">
                        <MdSwapHoriz size={24} />
                    </div>
                </div>

                {/* Content */}
                <div className="p-8 space-y-6 max-h-[70vh] overflow-y-auto custom-scrollbar">
                    {error && (
                        <div className="p-4 rounded-xl border border-red-200 bg-red-50 text-red-700 text-xs font-bold animate-shake uppercase tracking-tight">
                            {error}
                        </div>
                    )}

                    <div className="grid grid-cols-2 gap-4 text-left">
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-1">{t('inventory_view:modal.flow_type', 'Tipo de Fluxo')}</label>
                            <select
                                value={movementType}
                                onChange={(e) => setMovementType(e.target.value as MovementType)}
                                className="w-full px-4 py-3 rounded-xl bg-gray-50 dark:bg-neutral-800 border border-gray-100 dark:border-gray-700 text-sm font-bold focus:ring-2 focus:ring-blue-500 transition-all outline-none"
                            >
                                <option value="In">{t('inventory_view:movements.in', 'Entrada')} (+)</option>
                                <option value="Out">{t('inventory_view:movements.out', 'Saída')} (-)</option>
                            </select>
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-1">{t('inventory_view:modal.reason', 'Motivação')}</label>
                            <select
                                value={movementReason}
                                onChange={(e) => setMovementReason(e.target.value as MovementReason)}
                                className="w-full px-4 py-3 rounded-xl bg-gray-50 dark:bg-neutral-800 border border-gray-100 dark:border-gray-700 text-sm font-bold focus:ring-2 focus:ring-blue-500 transition-all outline-none"
                            >
                                <option value="Purchase">{t('inventory_view:reasons.Purchase', 'Compra')}</option>
                                <option value="Sale">{t('inventory_view:reasons.Sale', 'Venda')}</option>
                                <option value="Internal Use">{t('inventory_view:reasons.Internal Use', 'Uso Interno')}</option>
                                <option value="Return">{t('inventory_view:reasons.Return', 'Devolução')}</option>
                                <option value="Adjustment">{t('inventory_view:reasons.Adjustment', 'Ajuste Manual')}</option>
                            </select>
                        </div>
                    </div>

                    {/* Quantity */}
                    <div className="space-y-1.5 text-left">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-1">{t('inventory_view:modal.quantity', 'Quantidade')}</label>
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={decrementQty}
                                disabled={movementQty <= 0}
                                className="w-12 h-12 rounded-xl bg-gray-100 dark:bg-neutral-800 border border-gray-200 dark:border-gray-700 flex items-center justify-center text-gray-500 hover:bg-red-50 hover:text-red-500 hover:border-red-200 dark:hover:bg-red-900/20 dark:hover:text-red-400 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                                <MdRemove size={20} />
                            </button>
                            <input
                                type="text"
                                inputMode="numeric"
                                value={movementQty || ''}
                                onChange={(e) => handleQuantityChange(e.target.value)}
                                className="flex-1 px-4 py-3 rounded-xl bg-gray-50 dark:bg-neutral-800 border border-gray-100 dark:border-gray-700 text-2xl font-black text-center text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all outline-none"
                                placeholder="0"
                            />
                            <button
                                type="button"
                                onClick={incrementQty}
                                className="w-12 h-12 rounded-xl bg-gray-100 dark:bg-neutral-800 border border-gray-200 dark:border-gray-700 flex items-center justify-center text-gray-500 hover:bg-emerald-50 hover:text-emerald-500 hover:border-emerald-200 dark:hover:bg-emerald-900/20 dark:hover:text-emerald-400 transition-all"
                            >
                                <MdAdd size={20} />
                            </button>
                        </div>
                    </div>

                    {/* Cost & Supplier (for entries) */}
                    {movementType === 'In' && (
                        <div className="space-y-5 pt-4 border-t border-gray-100 dark:border-gray-800 animate-in slide-in-from-top-4">
                            <div className="space-y-1.5 text-left">
                                <div className="flex items-center gap-2 pl-1">
                                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">{t('inventory_view:modal.total_cost', 'Preço de Custo Total')}</label>
                                    <div className="group relative" title={`${t('inventory_view:modal.total_cost', 'Custo Total')}: ${t('inventory_view:modal.total_cost_tooltip', 'Valor total pago nesta compra (quantidade × preço unitário).')}`}>
                                        <MdInfo size={12} className="text-gray-300 hover:text-blue-500 cursor-help transition-colors" />
                                    </div>
                                </div>
                                <div className="relative">
                                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-bold text-gray-400 pointer-events-none select-none">{activeCurrency}</div>
                                    <input
                                        type="text"
                                        inputMode="decimal"
                                        value={movementCost}
                                        onChange={(e) => setMovementCost(formatCurrencyInput(e.target.value))}
                                        placeholder="0,00"
                                        className="w-full pl-12 pr-4 py-3 rounded-xl bg-gray-50 dark:bg-neutral-800 border border-gray-100 dark:border-gray-700 text-lg font-bold text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-all outline-none text-right"
                                    />
                                </div>
                            </div>
                            <div className="space-y-1.5 text-left">
                                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest pl-1">{t('inventory_view:modal.supplier', 'Fornecedor')}</label>
                                <RelationSelector
                                    name="supplier"
                                    value={movementSupplier}
                                    onChange={(_, v) => setMovementSupplier(String(v))}
                                    targetTable={suppliersTableId || ''}
                                    className="w-full px-4 py-3 rounded-xl bg-gray-50 dark:bg-neutral-800 border border-gray-100 dark:border-gray-700 text-sm font-bold text-gray-900 dark:text-white focus:ring-2 focus:ring-indigo-500 transition-all outline-none"
                                />
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-8 py-6 bg-gray-50 dark:bg-neutral-800/40 border-t border-gray-100 dark:border-gray-800 flex items-center justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-6 py-2.5 rounded-xl bg-white dark:bg-neutral-900 text-gray-600 dark:text-gray-300 font-bold border border-gray-200 dark:border-gray-700 hover:bg-gray-100 transition-all text-xs"
                        disabled={isSubmitting}
                    >
                        {t('inventory_view:modal.cancel', 'Desistir')}
                    </button>
                    <button
                        onClick={handleRegisterMovement}
                        className="px-8 py-2.5 rounded-xl bg-blue-600 text-white font-black hover:bg-blue-700 hover:scale-105 active:scale-95 transition-all shadow-lg shadow-blue-600/20 text-xs disabled:opacity-50"
                        disabled={isSubmitting}
                    >
                        {isSubmitting ? t('inventory_view:modal.submitting', 'Finalizando...') : t('inventory_view:modal.confirm', 'Confirmar Fluxo')}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}

export default MovementModal;
