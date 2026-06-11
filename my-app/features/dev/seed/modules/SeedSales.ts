import { ApiClient } from '../utils/ApiClient';
import { DataGenerator } from '../utils/DataGenerator';

export class SeedSales {
    private api: ApiClient;
    private gen: DataGenerator;

    constructor(api: ApiClient, gen: DataGenerator) {
        this.api = api;
        this.gen = gen;
    }

    async createSale(
        salesId: string,
        saleItemsId: string,
        data: {
            customerId: string,
            unitId: string,
            employeeId: string,
            date?: string,
            status?: 'Draft' | 'Finalized' | 'Cancelled',
            paymentStatus?: 'Paid' | 'Pending',
            items: any[]
        }
    ) {
        // 1. Create Draft
        const subtotal = data.items.reduce((sum, item) => sum + (item.unitPrice * (item.quantity || 1)), 0);

        // Realistic discount: ~30% of sales get a discount (5-15% of subtotal)
        const hasDiscount = this.gen.randomInt(0, 10) > 6;
        const discountPct = hasDiscount ? this.gen.randomInt(5, 15) / 100 : 0;
        const discountAmount = Math.round(subtotal * discountPct * 100) / 100;

        // Realistic tax: ISS + PIS/COFINS simplified (~6-12% of subtotal)
        const taxPct = this.gen.randomInt(6, 12) / 100;
        const taxAmount = Math.round(subtotal * taxPct * 100) / 100;

        const totalAmount = Math.max(0, subtotal - discountAmount);

        const saleId = await this.api.postRow(salesId, {
            unitId: data.unitId,
            customerId: data.customerId,
            date: data.date || new Date().toISOString(),
            status: 'Draft',
            paymentStatus: 'Pending',
            channel: this.gen.randomElement(['InStore', 'Online', 'App', 'Phone']),
            revenueType: this.gen.randomInt(0, 10) > 8 ? 'NonOperational' : 'Operational',
            subtotal,
            discountAmount,
            taxAmount,
            totalAmount,
            __isSystem: true
        }, 'Sales');

        // 2. Add Items
        for (const item of data.items) {
            await this.api.postRow(saleItemsId, {
                saleId,
                ...item,
                __isSystem: true
            }, 'Sale Items');
        }

        // 3. Finalize if needed
        if (data.status === 'Finalized') {
            await this.api.putRow(salesId, saleId, {
                status: 'Finalized',
                paymentStatus: data.paymentStatus || 'Paid'
            }, 'Sales (Finalize)');
        }

        console.log(`[SeedSales] Created ${data.status} Sale ${saleId}`);
        return saleId;
    }
}
