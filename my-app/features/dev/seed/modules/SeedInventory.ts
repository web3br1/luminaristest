
import { ApiClient } from '../utils/ApiClient';
import { DataGenerator } from '../utils/DataGenerator';

export class SeedInventory {
    private api: ApiClient;
    private gen: DataGenerator;

    constructor(api: ApiClient, gen: DataGenerator) {
        this.api = api;
        this.gen = gen;
    }

    async seedProductUnits(productUnitsId: string, products: any[], units: string[]) {
        console.log('[SeedInventory] Syncing Product Units...');

        // Wait for auto-creation plugins to settle (essential race condition mitigation)
        await new Promise(r => setTimeout(r, 1500));

        const existing = await this.api.getRows(productUnitsId);

        for (const prod of products) {
            const prodId = typeof prod === 'string' ? prod : prod.id;
            for (const uId of units) {
                let entry = existing.find((e: any) =>
                    String(e.data?.productId) === String(prodId) &&
                    String(e.data?.unitId) === String(uId)
                );

                if (!entry) {
                    // If plugin didn't create it, we create it manually
                    const id = await this.api.postRow(productUnitsId, {
                        productId: prodId,
                        unitId: uId,
                        stock: 0,
                        reserved: 0
                    }, 'Product Units');
                    entry = { id, data: { productId: prodId, unitId: uId, stock: 0, reserved: 0 } };
                }
            }
        }
    }

    async seedStockMovements(
        stockMovementsId: string,
        productUnitsId: string,
        products: { id: string, initialStock: number, salePrice?: number }[],
        units: string[],
        supplierId: string
    ): Promise<void> {
        console.log('[SeedInventory] seeding Initial Stock Movements...');

        // 1. Create Movements
        for (const prod of products) {
            for (const uId of units) {
                // Idempotency: Check if we already seeded this (simplistic check)
                // Ideally we check if stock is already high enough
                const unitsData = await this.api.getRows(productUnitsId);
                const entry = unitsData.find((u: any) => u.data?.productId === prod.id && u.data?.unitId === uId);
                const currentStock = Number(entry?.data?.stock || 0);

                if (currentStock >= prod.initialStock) {
                    console.log(`[SeedInventory] Stock already sufficient for ${prod.id} in ${uId} (${currentStock})`);
                    continue;
                }

                // Add movement
                await this.api.postRow(stockMovementsId, {
                    productId: prod.id,
                    unitId: uId,
                    type: 'In',
                    quantity: prod.initialStock,
                    date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
                    reason: 'Purchase',
                    sourceType: 'SEED',
                    cost: this.gen.randomInt(500, 5000), // Total cost for batch
                    supplierId
                }, 'Stock Movements');
            }
        }

        // 2. Update salePrice for all Product Units
        console.log('[SeedInventory] Updating Sale Prices...');
        for (const prod of products) {
            if (prod.salePrice) {
                const allUnits = await this.api.getRows(productUnitsId);
                for (const uId of units) {
                    const entry = allUnits.find((u: any) => u.data?.productId === prod.id && u.data?.unitId === uId);
                    if (entry && Number(entry.data?.salePrice || 0) !== prod.salePrice) {
                        await this.api.putRow(productUnitsId, entry.id, { ...entry.data, salePrice: prod.salePrice }, 'Product Units');
                    }
                }
            }
        }

        // 3. VERIFY AND FIX (Self-Healing)
        console.log('[SeedInventory] Verifying and Healing Stock Levels...');
        for (const prod of products) {
            for (const uId of units) {
                await this.verifyAndHeal(productUnitsId, prod.id, uId, prod.initialStock);
            }
        }
    }

    private async verifyAndHeal(tableId: string, prodId: string, uId: string, minStock: number) {
        let attempts = 0;
        while (attempts < 5) {
            const rows = await this.api.getRows(tableId);
            const entry = rows.find((r: any) => r.data?.productId === prodId && r.data?.unitId === uId);

            if (!entry) {
                console.warn(`[SeedInventory] Missing Product Unit for ${prodId} in ${uId}!`);
                return; // Should have been created above
            }

            const stock = Number(entry.data?.stock || 0);
            const reserved = Number(entry.data?.reserved || 0);

            // Self-Heal: Phantom Reservations
            if (reserved > 0) {
                console.warn(`[SeedInventory] Healing Phantom Reservation for ${prodId}: ${reserved} -> 0`);
                await this.api.putRow(tableId, entry.id, { ...entry.data, reserved: 0 }, 'Product Units (Fix)');
                continue; // Retry loop immediately
            }

            // Self-Heal: Stock Update Failure (Plugin lag or failure)
            if (stock < minStock && attempts > 2) {
                console.error(`[SeedInventory] FORCE FIXING Stock for ${prodId}: ${stock} -> ${minStock}`);
                await this.api.putRow(tableId, entry.id, { ...entry.data, stock: minStock }, 'Product Units (Force)');
                // We force set it, so we can assume it's good (or next loop will confirm)
            }

            if (stock >= minStock && reserved === 0) {
                console.log(`[SeedInventory] Stock OK: ${prodId} in ${uId} = ${stock}`);
                return;
            }

            await new Promise(r => setTimeout(r, 1000));
            attempts++;
        }
        console.warn(`[SeedInventory] FAILED to verify stock for ${prodId} in ${uId} after 5 attempts.`);
    }
}
