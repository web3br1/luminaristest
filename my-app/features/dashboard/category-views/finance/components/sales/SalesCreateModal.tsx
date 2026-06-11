'use client';

/**
 * SalesCreateModal — 2-tab ERP-grade sale creation modal
 *
 * Tab 0 "Cabeçalho": type selector (mixed schemas), date, unit, customer,
 *                     payment method, payment term, notes
 * Tab 1 "Itens":      table-format item list + discount + totals
 *
 * Footer: [Cancelar] · [Salvar Rascunho] · [Finalizar Venda ↗]
 *
 * Design system: rounded-3xl, frosted glass header/footer, emerald accent bar,
 * step-circle tabs (WizardModal pattern), labels UPPERCASE tracking-widest.
 */

import React, { useMemo, useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'next-i18next';
import { HiArrowRight } from 'react-icons/hi';
import RelationSelector from '@/features/dashboard/components/forms/RelationSelector';
import { isTableSchema, type IDynamicTable } from '@/features/dashboard/components/shared/dynamic-tables.client';
import { useSalesWizard } from '../../hooks/sales/useSalesWizard';
import { SaleItemsManager } from './create/SaleItemsManager';
import { PaymentTermChips } from './create/inputs';
import { useFormatCurrency } from '@/lib/context/CurrencyContext';
import type { SaleItemsVariant, SalesCreateModalProps } from './create/types';

// ─────────────────────────────────────────────────────────────
// Module-level constants
// ─────────────────────────────────────────────────────────────

const LABEL_CLASS = 'block text-[11px] uppercase font-black tracking-widest text-gray-500 dark:text-neutral-500 mb-1.5';
const FIELD_CLASS = 'mt-1 block w-full px-4 py-3 bg-white dark:bg-neutral-800 border border-gray-200 dark:border-gray-700 rounded-2xl shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-600 transition-all duration-200';
const SECTION_CARD_CLASS = 'p-5 bg-gray-50/50 dark:bg-neutral-800/60 rounded-2xl border border-gray-200/60 dark:border-gray-800 space-y-4';
const SECTION_HEADER_CLASS = 'text-[11px] uppercase font-black tracking-widest text-gray-500 dark:text-neutral-500';

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function detectSchemaVariant(saleItemsTable?: IDynamicTable | null): SaleItemsVariant {
    if (!isTableSchema(saleItemsTable?.schema)) return 'products';
    const names = new Set(saleItemsTable!.schema.fields.map(f => f.name));
    if (names.has('productId') && names.has('serviceId')) return 'mixed';
    if (names.has('serviceId')) return 'services';
    return 'products';
}

// ─────────────────────────────────────────────────────────────
// Sub-components
// ─────────────────────────────────────────────────────────────

interface SwitchProps {
    checked: boolean;
    onChange: (checked: boolean) => void;
    label: string;
}

function Switch({ checked, onChange, label }: SwitchProps) {
    return (
        <label className="flex items-center gap-3 cursor-pointer group select-none">
            <div
                role="switch"
                aria-checked={checked}
                onClick={() => onChange(!checked)}
                className={`relative w-11 h-6 rounded-full transition-colors flex-shrink-0 ${
                    checked ? 'bg-blue-600' : 'bg-gray-200 dark:bg-neutral-700'
                }`}
            >
                <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${
                    checked ? 'translate-x-5' : 'translate-x-0.5'
                }`} />
            </div>
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300 group-hover:text-gray-900 dark:group-hover:text-white transition-colors">
                {label}
            </span>
        </label>
    );
}

// ─────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────

export default function SalesCreateModal({
    isOpen,
    onClose,
    salesTable,
    saleItemsTable,
    stockIndex,
    onCreated,
}: SalesCreateModalProps) {
    const { t } = useTranslation(['finance_view', 'common']);
    const formatCurrency = useFormatCurrency();

    // ── Wizard hook — destructure for stable references ──────
    const {
        state: wizardState,
        reset,
        setDate,
        setCustomerId,
        setUnitId,
        setNotes,
        setSimpleCustomer,
        setSimpleCustomerName,
        setPaymentMethod,
        setPaymentTermDays,
        setVariant,
        setDiscount,
        addItem,
        removeItem,
        updateItem,
        subtotal,
        totalAmount,
        itemCount,
        canSubmit,
        submit,
    } = useSalesWizard();

    // ── Schema analysis ───────────────────────────────────────

    const schemaVariant = useMemo(() => detectSchemaVariant(saleItemsTable), [saleItemsTable]);

    const salesFields = useMemo(
        () => isTableSchema(salesTable?.schema) ? salesTable!.schema.fields : [],
        [salesTable]
    );

    const saleItemsFields = useMemo(
        () => isTableSchema(saleItemsTable?.schema) ? saleItemsTable!.schema.fields : [],
        [saleItemsTable]
    );

    const paymentMethodOptions = useMemo(() => {
        return salesFields.find(f => f.name === 'paymentMethod')?.options ?? [];
    }, [salesFields]);

    const hasPaymentMethod = paymentMethodOptions.length > 0;
    const hasPaymentTerm = salesFields.some(f => f.name === 'paymentTermDays' && f.type === 'number');

    const unitTargetTable = useMemo(
        () => salesFields.find(f => f.name === 'unitId')?.relation?.targetTable ?? '',
        [salesFields]
    );
    const customerTargetTable = useMemo(
        () => salesFields.find(f => f.name === 'customerId')?.relation?.targetTable ?? '',
        [salesFields]
    );

    // ── UI state ──────────────────────────────────────────────

    const [activeTab, setActiveTab] = useState<0 | 1>(0);
    const [submitError, setSubmitError] = useState<string | null>(null);

    // ── Lifecycle (stable refs in deps — no eslint-disable) ───

    useEffect(() => {
        if (!isOpen) return;
        reset();
        setActiveTab(0);
        setSubmitError(null);
    }, [isOpen, reset]);

    // Lock variant for non-mixed schemas
    useEffect(() => {
        if (!isOpen || schemaVariant === 'mixed') return;
        setVariant(schemaVariant === 'services' ? 'services' : 'products');
    }, [isOpen, schemaVariant, setVariant]);

    // ── Submit ────────────────────────────────────────────────

    // Derived primitive — controls redirect-to-tab on validation error (stable in deps)
    const headerHasMissingFields = !wizardState.unitId || (!wizardState.simpleCustomer && !wizardState.customerId);

    const handleSubmit = useCallback(async (finalize: boolean) => {
        if (!canSubmit) {
            setActiveTab(headerHasMissingFields ? 0 : 1);
            setSubmitError(t('finance_view:sales.modal.error_fill_fields', 'Preencha todos os campos obrigatórios.'));
            return;
        }
        setSubmitError(null);
        try {
            await submit(salesTable.id, saleItemsTable.id, finalize);
            onCreated();
            onClose();
        } catch (err: unknown) {
            const msg = err instanceof Error
                ? err.message
                : t('common:unknownErrorOccurred', 'Erro desconhecido');
            setSubmitError(msg);
        }
    }, [canSubmit, headerHasMissingFields, submit, salesTable.id, saleItemsTable.id, onCreated, onClose, t]);

    const tabs = useMemo(() => [
        { id: 0 as const, label: t('finance_view:sales.modal.tab_general', 'Cabeçalho') },
        { id: 1 as const, label: t('finance_view:sales.modal.tab_items', 'Itens') },
    ], [t]);

    // ─────────────────────────────────────────────────────────────
    // Render
    // ─────────────────────────────────────────────────────────────

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in">
            <div className="w-full max-w-3xl max-h-[90vh] bg-white dark:bg-neutral-900 rounded-3xl shadow-2xl overflow-hidden flex flex-col border border-white/20 dark:border-neutral-800 animate-in zoom-in-95 duration-200">

                {/* ─── Top accent bar (emerald = vendas) ─── */}
                <div className="h-1.5 w-full bg-gradient-to-r from-emerald-600 via-emerald-500 to-emerald-600 opacity-90 flex-none" />

                {/* ─── Header (frosted glass) ─── */}
                <div className="flex-none px-6 py-4 flex items-center justify-between border-b border-gray-100 dark:border-neutral-800 bg-white/50 dark:bg-neutral-900/50 backdrop-blur-md">
                    <div>
                        <h2 className="text-xl font-bold text-gray-900 dark:text-white tracking-tight">
                            {t('finance_view:sales.modal.title', 'Nova Venda')}
                        </h2>
                        <p className="text-[11px] text-gray-500 dark:text-neutral-500 uppercase font-bold tracking-widest mt-0.5">
                            {t('finance_view:sales.modal.subtitle', 'Criação de Venda')}
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2.5 rounded-2xl hover:bg-gray-100 dark:hover:bg-neutral-800 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-all duration-200"
                    >
                        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                    </button>
                </div>

                {/* ─── Step tabs (WizardModal pattern) ─── */}
                <div className="flex-none border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-neutral-900 px-4">
                    <nav className="flex gap-1">
                        {tabs.map(tab => {
                            const isActive = activeTab === tab.id;
                            const isDone = tab.id === 0 && activeTab === 1;
                            return (
                                <button
                                    key={tab.id}
                                    type="button"
                                    onClick={() => setActiveTab(tab.id)}
                                    className={`relative flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${
                                        isActive
                                            ? 'text-blue-600 dark:text-blue-400'
                                            : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                                    }`}
                                >
                                    {/* Step circle */}
                                    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold flex-shrink-0 transition-colors ${
                                        isDone
                                            ? 'bg-emerald-500 text-white'
                                            : isActive
                                            ? 'bg-blue-600 text-white'
                                            : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
                                    }`}>
                                        {isDone ? '✓' : tab.id + 1}
                                    </span>
                                    {tab.label}
                                    {/* Item count badge (Itens tab) */}
                                    {tab.id === 1 && itemCount > 0 && (
                                        <span className="ml-0.5 px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300">
                                            {itemCount}
                                        </span>
                                    )}
                                    {/* Active underline indicator */}
                                    {isActive && (
                                        <span className="absolute inset-x-0 -bottom-px h-0.5 bg-blue-600 dark:bg-blue-400" />
                                    )}
                                </button>
                            );
                        })}
                    </nav>
                </div>

                {/* ─── Error banner ─── */}
                {submitError && (
                    <div className="mx-6 mt-4 rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 px-4 py-3 text-sm flex items-center gap-2 animate-in slide-in-from-top-2">
                        <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                        </svg>
                        {submitError}
                    </div>
                )}

                {/* ─── Content ─── */}
                <div className="flex-1 overflow-y-auto custom-scrollbar p-6 min-h-[420px]">

                    {/* ══ Tab 0: Cabeçalho ══ */}
                    {activeTab === 0 && (
                        <div className="space-y-3">
                            {/* Segmented control — only for mixed schemas */}
                            {schemaVariant === 'mixed' && (
                                <div>
                                    <p className={SECTION_HEADER_CLASS}>
                                        {t('finance_view:sales.modal.sale_type', 'Tipo de Venda')}
                                    </p>
                                    <div className="flex p-1.5 bg-gray-100 dark:bg-neutral-800 rounded-2xl w-fit gap-1 mt-2">
                                        {(['products', 'services'] as const).map(v => (
                                            <button
                                                key={v}
                                                type="button"
                                                onClick={() => setVariant(v)}
                                                className={`px-4 py-1.5 rounded-xl text-sm font-bold transition-all duration-200 ${
                                                    wizardState.variant === v
                                                        ? 'bg-white dark:bg-neutral-700 text-blue-600 dark:text-blue-400 shadow-sm'
                                                        : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
                                                }`}
                                            >
                                                {v === 'products'
                                                    ? t('finance_view:sales.modal.products', 'Produtos')
                                                    : t('finance_view:sales.modal.services', 'Serviços')}
                                            </button>
                                        ))}
                                    </div>
                                    {wizardState.items.length > 0 && (
                                        <p className="mt-2 text-xs text-amber-600 dark:text-amber-400 font-medium">
                                            {t('finance_view:sales.modal.variant_change_warning', 'Alterar o tipo remove os itens adicionados.')}
                                        </p>
                                    )}
                                </div>
                            )}

                            {/* Section: Informações da Venda */}
                            <div className={SECTION_CARD_CLASS}>
                                <p className={SECTION_HEADER_CLASS}>
                                    {t('finance_view:sales.modal.section_info', 'Informações da Venda')}
                                </p>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className={LABEL_CLASS}>
                                            {t('finance_view:sales.modal.date', 'Data')}
                                        </label>
                                        <input
                                            type="date"
                                            value={wizardState.date}
                                            onChange={e => setDate(e.target.value)}
                                            className={FIELD_CLASS}
                                        />
                                    </div>
                                    <div>
                                        <label className={LABEL_CLASS}>
                                            {t('finance_view:sales.modal.unit', 'Unidade')}
                                            <span className="text-red-500 ml-0.5">*</span>
                                        </label>
                                        <RelationSelector
                                            name="unitId"
                                            value={wizardState.unitId}
                                            onChange={(_: string, v: string | string[] | null) => setUnitId(Array.isArray(v) ? (v[0] ?? '') : String(v ?? ''))}
                                            targetTable={unitTargetTable}
                                            className={FIELD_CLASS}
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Section: Cliente */}
                            <div className={SECTION_CARD_CLASS}>
                                <p className={SECTION_HEADER_CLASS}>
                                    {t('finance_view:sales.modal.section_customer', 'Cliente')}
                                </p>
                                <Switch
                                    checked={wizardState.simpleCustomer}
                                    onChange={setSimpleCustomer}
                                    label={t('finance_view:sales.modal.simple_customer', 'Cliente avulso (sem cadastro)')}
                                />
                                {wizardState.simpleCustomer ? (
                                    <input
                                        type="text"
                                        value={wizardState.simpleCustomerName}
                                        onChange={e => setSimpleCustomerName(e.target.value)}
                                        placeholder={t('finance_view:sales.modal.customer_name', 'Nome do cliente...')}
                                        className={FIELD_CLASS}
                                    />
                                ) : (
                                    <RelationSelector
                                        name="customerId"
                                        value={wizardState.customerId}
                                        onChange={(_: string, v: string | string[] | null) => setCustomerId(Array.isArray(v) ? (v[0] ?? '') : String(v ?? ''))}
                                        targetTable={customerTargetTable}
                                        className={FIELD_CLASS}
                                    />
                                )}
                            </div>

                            {/* Section: Pagamento */}
                            {(hasPaymentMethod || hasPaymentTerm) && (
                                <div className={SECTION_CARD_CLASS}>
                                    <p className={SECTION_HEADER_CLASS}>
                                        {t('finance_view:sales.modal.section_payment', 'Pagamento')}
                                    </p>
                                    {hasPaymentMethod && (
                                        <div>
                                            <label className={LABEL_CLASS}>
                                                {t('finance_view:sales.modal.payment_method', 'Forma')}
                                            </label>
                                            <select
                                                value={wizardState.paymentMethod}
                                                onChange={e => setPaymentMethod(e.target.value)}
                                                className={FIELD_CLASS}
                                            >
                                                <option value="">{t('common:select_placeholder', 'Selecione...')}</option>
                                                {paymentMethodOptions.map(o => {
                                                    const val = typeof o === 'string' ? o : o.value;
                                                    const lab = typeof o === 'string' ? o : o.label;
                                                    return <option key={val} value={val}>{lab}</option>;
                                                })}
                                            </select>
                                        </div>
                                    )}
                                    {hasPaymentTerm && (
                                        <div>
                                            <label className={LABEL_CLASS}>
                                                {t('finance_view:sales.modal.payment_term', 'Prazo')}
                                            </label>
                                            <PaymentTermChips
                                                value={wizardState.paymentTermDays}
                                                onChange={setPaymentTermDays}
                                            />
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Section: Observações */}
                            <div className={SECTION_CARD_CLASS}>
                                <p className={SECTION_HEADER_CLASS}>
                                    {t('finance_view:sales.modal.section_notes', 'Observações')}
                                </p>
                                <textarea
                                    value={wizardState.notes}
                                    onChange={e => setNotes(e.target.value)}
                                    rows={3}
                                    placeholder={t('finance_view:sales.modal.notes_placeholder', 'Observações sobre a venda...')}
                                    className={`${FIELD_CLASS} resize-none`}
                                />
                            </div>
                        </div>
                    )}

                    {/* ══ Tab 1: Itens ══ */}
                    {activeTab === 1 && (
                        <SaleItemsManager
                            items={wizardState.items}
                            variant={wizardState.variant}
                            unitId={wizardState.unitId}
                            saleItemsFields={saleItemsFields}
                            stockIndex={stockIndex}
                            onAddItem={addItem}
                            onRemoveItem={removeItem}
                            onUpdateItem={updateItem}
                            discountAmount={wizardState.discountAmount}
                            onDiscountChange={setDiscount}
                            subtotal={subtotal}
                            totalAmount={totalAmount}
                            formatCurrency={formatCurrency}
                        />
                    )}
                </div>

                {/* ─── Footer (frosted glass) ─── */}
                <div className="flex-none px-6 py-4 bg-gray-50/80 dark:bg-neutral-800/50 backdrop-blur-sm border-t border-gray-100 dark:border-neutral-800 flex items-center justify-between">
                    {/* Cancel */}
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-medium text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
                    >
                        {t('finance_view:sales.modal.btn_cancel', 'Cancelar')}
                    </button>

                    {/* Primary actions */}
                    <div className="flex items-center gap-2">
                        {activeTab === 0 ? (
                            /* Tab 0 → Próximo */
                            <button
                                onClick={() => setActiveTab(1)}
                                className="px-5 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 shadow-lg shadow-blue-600/20 hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 flex items-center gap-2"
                            >
                                {t('finance_view:sales.modal.btn_next', 'Próximo')}
                                <HiArrowRight size={16} />
                            </button>
                        ) : (
                            /* Tab 1 → Salvar Rascunho + Finalizar Venda */
                            <>
                                <button
                                    disabled={!canSubmit || wizardState.isSubmitting}
                                    onClick={() => handleSubmit(false)}
                                    className="px-4 py-2.5 rounded-xl bg-gray-100 dark:bg-neutral-700 text-gray-700 dark:text-gray-200 text-sm font-semibold hover:bg-gray-200 dark:hover:bg-neutral-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
                                >
                                    {t('finance_view:sales.modal.btn_draft', 'Salvar Rascunho')}
                                </button>
                                <button
                                    disabled={!canSubmit || wizardState.isSubmitting}
                                    onClick={() => handleSubmit(true)}
                                    className="px-6 py-2.5 rounded-xl bg-emerald-600 text-white text-sm font-bold hover:bg-emerald-700 shadow-lg shadow-emerald-600/20 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 disabled:shadow-none transition-all duration-200 flex items-center gap-2"
                                >
                                    {wizardState.isSubmitting ? (
                                        <>
                                            <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                            {t('common:savingChangesButton', 'Salvando...')}
                                        </>
                                    ) : (
                                        t('finance_view:sales.modal.btn_finalize', 'Finalizar Venda')
                                    )}
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
