
import { ApiClient } from '../utils/ApiClient';
import { DataGenerator } from '../utils/DataGenerator';

export class SeedCatalog {
    private api: ApiClient;
    private gen: DataGenerator;

    constructor(api: ApiClient, gen: DataGenerator) {
        this.api = api;
        this.gen = gen;
    }

    async seedProducts(pid: string, count: number = 15) {
        console.log(`[SeedCatalog] Seeding Professional Products...`);
        const products = [
            { name: 'Shampoo L\'Oréal Absolut Repair 500ml', brand: 'L\'Oréal', cat: 'Cabelo', sku: 'SH-ABS-500' },
            { name: 'Máscara Wella Brilliance 200ml', brand: 'Wella', cat: 'Cabelo', sku: 'MS-BRI-200' },
            { name: 'Óleo Kérastase Elixir Ultime 100ml', brand: 'Kérastase', cat: 'Finalização', sku: 'OL-ELI-100' },
            { name: 'Protetor Solar Mantecorp Episol 50', brand: 'Mantecorp', cat: 'Pele', sku: 'PS-EPI-50' },
            { name: 'Esmalte Risqué Vermelho Desejo', brand: 'Risqué', cat: 'Unhas', sku: 'ES-RIS-VD' }
        ];
        const ids = [];

        for (const p of products) {
            let row = await this.api.findExisting(pid, 'name', p.name);
            if (!row) {
                const id = await this.api.postRow(pid, {
                    name: p.name,
                    brand: p.brand,
                    category: p.cat,
                    sku: p.sku,
                    usageType: 'Both',
                    description: `Produto profissional de alta performance para ${p.cat.toLowerCase()}.`,
                    __isSystem: true
                }, 'Products');
                row = { id, data: { name: p.name, brand: p.brand, category: p.cat, sku: p.sku } };
            }
            if (row) ids.push({ id: row.id, ...row.data });
        }
        return ids;
    }

    async seedServices(sid: string, count: number = 10) {
        console.log(`[SeedCatalog] Seeding Specialized Services...`);
        const services = [
            { name: 'Corte Designer Feminino', cat: 'Corte', price: 250, dur: 60 },
            { name: 'Balayage Premium Signature', cat: 'Coloração', price: 850, dur: 180 },
            { name: 'Tratamento Kérastase Ritual', cat: 'Tratamento', price: 350, dur: 45 },
            { name: 'Manicure & Pedicure SPA', cat: 'Unhas', price: 120, dur: 75 },
            { name: 'Limpeza de Pele Profunda', cat: 'Estética', price: 280, dur: 90 }
        ];
        const ids = [];

        for (const s of services) {
            let row = await this.api.findExisting(sid, 'name', s.name);
            if (!row) {
                const id = await this.api.postRow(sid, {
                    name: s.name,
                    category: s.cat,
                    price: s.price,
                    duration: s.dur,
                    isActive: true,
                    __isSystem: true
                }, 'Services');
                row = { id, data: { name: s.name, category: s.cat, price: s.price, duration: s.dur } };
            }
            if (row) ids.push({ id: row.id, ...row.data });
        }
        return ids;
    }
}
