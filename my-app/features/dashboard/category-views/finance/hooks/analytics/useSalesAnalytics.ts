'use client';

import { useMemo } from 'react';
import { normalizeRows } from '../../utils/normalizers';

import { SaleRecord, SaleItemRecord, SalesAnalytics } from '../../types/sales.types';

/**
 * Hook to compute analytics from sales and sale items data.
 */
export function useSalesAnalytics(
    salesRecords: unknown[],
    saleItemsRecords: unknown[]
): SalesAnalytics {
    const salesList = useMemo(() => normalizeRows<SaleRecord>(salesRecords), [salesRecords]);
    const itemsList = useMemo(() => normalizeRows<SaleItemRecord>(saleItemsRecords), [saleItemsRecords]);

    const analytics = useMemo(() => {
        const statusCounts: Record<string, number> = {};
        let paidTotal = 0;
        let receivableTotal = 0;

        for (const s of salesList) {
            const st = String(s.status || 'Draft');
            statusCounts[st] = (statusCounts[st] || 0) + 1;

            const isCancelled = String(s.status || '').toLowerCase() === 'cancelled';
            const isPaid = String(s.paymentStatus || '').toLowerCase() === 'paid';

            if (isCancelled) continue;

            const total = Number(s.totalAmount ?? 0);
            if (isPaid) paidTotal += total;
            else receivableTotal += total;
        }

        // Monthly totals (last 6 months)
        const monthly: Record<string, number> = {};
        const now = new Date();
        const start = new Date(now.getFullYear(), now.getMonth() - 5, 1);

        for (const s of salesList) {
            const d = s.date ? new Date(s.date) : null;
            if (!d || d < start) continue;

            const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
            const isCancelled = String(s.status || '').toLowerCase() === 'cancelled';
            if (isCancelled) continue;

            monthly[key] = (monthly[key] || 0) + Number(s.totalAmount ?? 0);
        }

        // Stock units used
        let stockUnitsUsed = 0;
        for (const item of itemsList) {
            const isProduct = !!item.productId && !item.serviceId;
            if (isProduct) stockUnitsUsed += Number(item.quantity || 0);
        }

        // Pre-compute subtotals per sale
        const saleIdToSubtotal: Record<string, number> = {};
        for (const it of itemsList) {
            const saleId = String(it.saleId || '');
            if (!saleId) continue;
            const isProduct = !!it.productId && !it.serviceId;
            const qty = isProduct ? Number(it.quantity || 1) : 1;
            const price = Number(it.unitPrice || 0);
            saleIdToSubtotal[saleId] = (saleIdToSubtotal[saleId] || 0) + qty * price;
        }

        return { statusCounts, paidTotal, receivableTotal, monthly, stockUnitsUsed, saleIdToSubtotal };
    }, [salesList, itemsList]);

    // Derived chart data
    const draftFinalData = useMemo(() => {
        const draft = salesList.filter(s => String(s.status || 'draft').toLowerCase() === 'draft').length;
        const finalized = salesList.filter(s => String(s.status || '').toLowerCase() === 'finalized').length;
        return [
            { name: 'Draft', value: draft },
            { name: 'Finalizadas', value: finalized },
        ];
    }, [salesList]);

    const paymentBreakdownData = useMemo(() => {
        let paid = 0, notPaid = 0, cancelled = 0;
        for (const s of salesList) {
            const st = String(s.status || '').toLowerCase();
            if (st === 'cancelled') { cancelled++; continue; }
            const ps = String(s.paymentStatus || '').toLowerCase();
            if (ps === 'paid') paid++; else notPaid++;
        }
        return [
            { name: 'Pagas', value: paid },
            { name: 'Não pagas', value: notPaid },
            { name: 'Canceladas', value: cancelled },
        ];
    }, [salesList]);

    const amountsData = useMemo(() => ([
        { name: 'Valores', Pago: analytics.paidTotal, Pendente: analytics.receivableTotal },
    ]), [analytics.paidTotal, analytics.receivableTotal]);

    return {
        ...analytics,
        draftFinalData,
        paymentBreakdownData,
        amountsData,
    };
}
