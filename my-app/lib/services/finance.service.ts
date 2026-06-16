/**
 * FinanceService - Data layer for the Finance module
 * 
 * @description
 * Encapsulates all API requests for Sales, Expenses, and Analytics.
 * Following the Gold Standard Flat Service Architecture.
 */

import { DynamicTableService } from './dynamic-table.service';
import { SaleData, SaleItemData, NewSaleItem } from '@/features/dashboard/category-views/finance/types/sales.types';

export class FinanceService {
    /**
     * Creates a complete Sale with its items
     */
    static async createSaleWithItems(
        salesTableId: string,
        saleItemsTableId: string,
        saleData: SaleData,
        items: NewSaleItem[]
    ): Promise<string> {
        // 1. Create the Sale record
        const saleResponse = await DynamicTableService.createRecord(salesTableId, { data: saleData });
        const saleResponseData = saleResponse?.data as { id?: string } | undefined;
        const saleId = saleResponseData?.id || saleResponse?.id;

        if (!saleId) {
            throw new Error('Failed to create sale: No ID returned');
        }

        // 2. Create Sale Items in parallel
        const itemPromises = items.map(item => {
            const itemPayload: SaleItemData = {
                saleId,
                productId: item.productId || undefined,
                serviceId: item.serviceId || undefined,
                type: item.itemType,
                quantity: item.itemType === 'Product' ? (item.quantity || 1) : 1,
                unitPrice: item.unitPrice || 0,
                commission: item.commission || undefined,
                responsibleEmployeeId: item.responsibleEmployeeId || undefined,
                appointmentId: item.appointmentId || undefined,
                description: item.description || undefined,
            };

            return DynamicTableService.createRecord(saleItemsTableId, { data: itemPayload });
        });

        await Promise.all(itemPromises);

        return saleId;
    }

    /**
     * Fetches analytics data for a specific chart
     */
    static async fetchChartData(
        chartKey: string, 
        datePreset: string, 
        presetKey?: string, 
        extraParams?: Record<string, string>
    ) {
        const search = new URLSearchParams({ key: chartKey, datePreset, ...(extraParams || {}) });
        const url = presetKey
            ? `/analytics/presets/${encodeURIComponent(presetKey)}/data?${search.toString()}`
            : `/analytics/data?${search.toString()}`;
        
        return DynamicTableService.getCustomData(url);
    }

    /**
     * Discovers KPIs for a specific table
     */
    static async discoverKPIs(tableId: string, datePreset: string) {
        const search = new URLSearchParams({ datePreset });
        return DynamicTableService.getCustomData(`/analytics/discover/${encodeURIComponent(tableId)}?${search.toString()}`);
    }

    /**
     * Generic method to fetch finance-related data
     */
    static async getFinanceRecords(tableId: string) {
        return DynamicTableService.getTableData(tableId);
    }

    /**
     * Updates an existing sale
     */
    static async updateSale(salesTableId: string, saleId: string, saleData: Partial<SaleData>) {
        return DynamicTableService.updateRecord(salesTableId, saleId, { data: saleData });
    }

    /**
     * Fetches drill-down data for a specific set of records
     */
    static async getDrillDownData(queryParams: string) {
        return FinanceService.getCustomData(`/analytics/drill-down?${queryParams}`);
    }

    /**
     * Generic custom data fetch (proxy to DynamicTableService)
     */
    static async getCustomData(url: string) {
        return DynamicTableService.getCustomData(url);
    }
}
