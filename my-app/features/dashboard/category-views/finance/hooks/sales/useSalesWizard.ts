'use client';

/**
 * useSalesWizard Hook - Gerencia estado do wizard de criação de venda
 *
 * @description
 * Hook principal para gerenciar todo o estado e lógica do wizard de vendas.
 * Inclui gerenciamento de items, cálculos e submissão.
 */

import { useState, useCallback, useMemo, useRef } from 'react';
import type { NewSaleItem, SalesWizardState, SaleData } from '../../types';
import { FinanceService } from '../../services/FinanceService';

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export interface UseSalesWizardReturn {
    // State
    state: SalesWizardState;

    // Header setters
    setDate: (date: string) => void;
    setCustomerId: (id: string) => void;
    setUnitId: (id: string) => void;
    setNotes: (notes: string) => void;
    setSimpleCustomer: (simple: boolean) => void;
    setSimpleCustomerName: (name: string) => void;
    setPaymentMethod: (method: string) => void;
    setPaymentTermDays: (days: number) => void;
    setVariant: (variant: 'products' | 'services') => void;
    setDiscount: (amount: number) => void;

    // Item management
    addItem: () => void;
    removeItem: (tempId: string) => void;
    updateItem: (tempId: string, updates: Partial<NewSaleItem>) => void;

    // Computed values
    subtotal: number;
    totalAmount: number;
    itemCount: number;

    // Validation
    canSubmit: boolean;

    // Submission
    submit: (salesTableId: string, saleItemsTableId: string, finalize?: boolean) => Promise<void>;
    reset: () => void;
}

// ─────────────────────────────────────────────────────────────
// Initial State
// ─────────────────────────────────────────────────────────────

const createInitialState = (): SalesWizardState => ({
    date: new Date().toISOString().substring(0, 10),
    customerId: '',
    unitId: '',
    notes: '',
    simpleCustomer: false,
    simpleCustomerName: '',
    paymentMethod: '',
    paymentTermDays: 0,
    discountAmount: 0,
    variant: 'products',
    items: [],
    isSubmitting: false,
    error: null,
});

// ─────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────

/**
 * Hook para gerenciar o wizard de criação de vendas
 */
export function useSalesWizard(): UseSalesWizardReturn {
    const [state, setState] = useState<SalesWizardState>(createInitialState);

    // Ref de snapshot — permite que submit leia o estado atual sem dependência estável quebrada
    const stateRef = useRef(state);
    stateRef.current = state;

    // ─────────────────────────────────────────────────────────────
    // Header Setters
    // ─────────────────────────────────────────────────────────────

    const setDate = useCallback((date: string) => {
        setState(prev => ({ ...prev, date }));
    }, []);

    const setCustomerId = useCallback((customerId: string) => {
        setState(prev => ({ ...prev, customerId }));
    }, []);

    const setUnitId = useCallback((unitId: string) => {
        setState(prev => ({ ...prev, unitId }));
    }, []);

    const setNotes = useCallback((notes: string) => {
        setState(prev => ({ ...prev, notes }));
    }, []);

    const setSimpleCustomer = useCallback((simpleCustomer: boolean) => {
        setState(prev => ({ ...prev, simpleCustomer, customerId: simpleCustomer ? '' : prev.customerId }));
    }, []);

    const setSimpleCustomerName = useCallback((simpleCustomerName: string) => {
        setState(prev => ({ ...prev, simpleCustomerName }));
    }, []);

    const setPaymentMethod = useCallback((paymentMethod: string) => {
        setState(prev => ({ ...prev, paymentMethod }));
    }, []);

    const setPaymentTermDays = useCallback((paymentTermDays: number) => {
        setState(prev => ({ ...prev, paymentTermDays }));
    }, []);

    const setDiscount = useCallback((discountAmount: number) => {
        setState(prev => ({ ...prev, discountAmount }));
    }, []);

    // Variant setter — clears items on change to enforce type homogeneity (backend rule)
    const setVariant = useCallback((variant: 'products' | 'services') => {
        setState(prev => ({ ...prev, variant, items: [] }));
    }, []);

    // ─────────────────────────────────────────────────────────────
    // Item Management
    // ─────────────────────────────────────────────────────────────

    const addItem = useCallback(() => {
        setState(prev => {
            const itemType = prev.variant === 'services' ? 'Service' : 'Product';
            const newItem: NewSaleItem = {
                id: `temp-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
                itemType,
                quantity: 1,
                unitPrice: 0,
            };
            return { ...prev, items: [...prev.items, newItem] };
        });
    }, []);

    const removeItem = useCallback((tempId: string) => {
        setState(prev => ({
            ...prev,
            items: prev.items.filter(item => item.id !== tempId),
        }));
    }, []);

    const updateItem = useCallback((tempId: string, updates: Partial<NewSaleItem>) => {
        setState(prev => ({
            ...prev,
            items: prev.items.map(item =>
                item.id === tempId ? { ...item, ...updates } : item
            ),
        }));
    }, []);

    // ─────────────────────────────────────────────────────────────
    // Computed Values
    // ─────────────────────────────────────────────────────────────

    const subtotal = useMemo(() => {
        return state.items.reduce((sum, item) => {
            const qty = item.itemType === 'Product' ? Number(item.quantity || 1) : 1;
            const price = Number(item.unitPrice || 0);
            return sum + qty * price;
        }, 0);
    }, [state.items]);

    const totalAmount = useMemo(
        () => Math.max(0, subtotal - (state.discountAmount || 0)),
        [subtotal, state.discountAmount]
    );

    const itemCount = useMemo(() => state.items.length, [state.items]);

    // ─────────────────────────────────────────────────────────────
    // Validation
    // ─────────────────────────────────────────────────────────────

    const canSubmit = useMemo(() => {
        if (!state.unitId) return false;
        if (!state.simpleCustomer && !state.customerId) return false;
        if (state.items.length === 0) return false;
        const isProduct = state.variant !== 'services';
        return state.items.every(item => {
            if (isProduct && !item.productId) return false;
            if (!isProduct && !item.serviceId) return false;
            if (Number(item.unitPrice || 0) <= 0) return false;
            return true;
        });
    }, [state.unitId, state.simpleCustomer, state.customerId, state.items, state.variant]);

    // ─────────────────────────────────────────────────────────────
    // Submission — useRef snapshot pattern: deps vazios, referência estável
    // ─────────────────────────────────────────────────────────────

    const submit = useCallback(async (
        salesTableId: string,
        saleItemsTableId: string,
        finalize: boolean = false
    ): Promise<void> => {
        const s = stateRef.current;

        // Recompute totals from snapshot to avoid stale closure on subtotal/totalAmount
        const sub = s.items.reduce((acc, item) => {
            const qty = item.itemType === 'Product' ? Number(item.quantity || 1) : 1;
            return acc + qty * Number(item.unitPrice || 0);
        }, 0);
        const total = Math.max(0, sub - (s.discountAmount || 0));

        setState(prev => ({ ...prev, isSubmitting: true, error: null }));

        try {
            const saleData: SaleData = {
                date: s.date,
                customerId: s.simpleCustomer ? undefined : (s.customerId || undefined),
                simpleCustomer: s.simpleCustomer,
                simpleCustomerName: s.simpleCustomer ? s.simpleCustomerName : undefined,
                unitId: s.unitId || undefined,
                status: finalize ? 'Finalized' : 'Draft',
                paymentStatus: 'Pending',
                subtotal: sub,
                totalAmount: total,
                discountAmount: s.discountAmount > 0 ? s.discountAmount : undefined,
                paymentMethod: s.paymentMethod || undefined,
                paymentTermDays: s.paymentTermDays || undefined,
                notes: s.notes || undefined,
            };

            await FinanceService.createSaleWithItems(salesTableId, saleItemsTableId, saleData, s.items);
            setState(prev => ({ ...prev, isSubmitting: false }));
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Erro ao criar venda';
            setState(prev => ({ ...prev, isSubmitting: false, error: message }));
            throw err; // re-throw so the modal catch block receives the real error
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps -- stateRef.current always fresh

    const reset = useCallback(() => {
        setState(createInitialState());
    }, []);

    // ─────────────────────────────────────────────────────────────
    // Return
    // ─────────────────────────────────────────────────────────────

    return {
        state,
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
        reset,
    };
}
