
import { ApiClient } from '../utils/ApiClient';
import { DataGenerator } from '../utils/DataGenerator';

export class SeedPeople {
    private api: ApiClient;
    private gen: DataGenerator;

    constructor(api: ApiClient, gen: DataGenerator) {
        this.api = api;
        this.gen = gen;
    }

    async seedSuppliers(sid: string): Promise<string[]> {
        console.log('[SeedPeople] Seeding Suppliers...');
        const suppliers = [
            { name: 'L\'Oréal Professionnel Brasil', contact: 'Carlos Eduardo', phone: '(11) 2131-4000' },
            { name: 'Wella Company Estética', contact: 'Mariana Silva', phone: '(11) 3323-5000' },
            { name: 'Keune Haircosmetics SP', contact: 'Roberto Klein', phone: '(11) 4004-9988' },
            { name: 'Bio Extratus Distribuidora', contact: 'Luciana Ferro', phone: '(11) 99887-1122' },
            { name: 'Mantecorp Skincare', contact: 'Dr. Arthur Mendes', phone: '(11) 3221-5544' }
        ];
        const ids: string[] = [];

        for (const s of suppliers) {
            const existing = await this.api.findExisting(sid, 'supplierName', s.name);
            if (existing) {
                ids.push(existing.id);
                continue;
            }

            const id = await this.api.postRow(sid, {
                supplierName: s.name,
                email: this.gen.emailFromName(s.name),
                contactPerson: s.contact,
                phone: s.phone,
                taxId: `${this.gen.randomInt(10, 99)}.${this.gen.randomInt(100, 999)}.${this.gen.randomInt(100, 999)}/0001-${this.gen.randomInt(10, 99)}`,
                street: 'Av. Chucri Zaidan',
                addressNumber: `${this.gen.randomInt(500, 3000)}`,
                neighborhood: 'Vila Cordeiro',
                city: 'São Paulo',
                state: 'SP',
                zipCode: '04583-110',
                country: 'Brasil'
            }, 'Suppliers');
            if (id) ids.push(id);
        }
        return ids;
    }

    async seedCustomers(cid: string, unitIds: string[], count: number = 20): Promise<string[]> {
        console.log(`[SeedPeople] Seeding ${count} Professional Customers...`);
        const names = this.gen.generateNames(count);
        const ids: string[] = [];

        const leadSources = ['Instagram Ads', 'Google Maps', 'Indicação Amigo', 'Passante (Jardins)', 'Influencer Partner'];
        const stages = ['Loyal', 'Active', 'New', 'Prospect', 'AtRisk'];

        for (const name of names) {
            const existing = await this.api.findExisting(cid, 'name', name);
            if (existing) {
                ids.push(existing.id);
                continue;
            }

            const id = await this.api.postRow(cid, {
                name,
                email: this.gen.emailFromName(name),
                mainUnitId: this.gen.randomElement(unitIds),
                leadSource: this.gen.randomElement(leadSources),
                lifecycleStage: this.gen.randomElement(stages),
                phone: '(11) 9' + this.gen.randomInt(1000, 9999) + '-' + this.gen.randomInt(1000, 9999),
                taxId: `${this.gen.randomInt(100, 999)}.${this.gen.randomInt(100, 999)}.${this.gen.randomInt(100, 999)}-${this.gen.randomInt(10, 99)}`,
                street: 'Rua Bela Cintra',
                addressNumber: `${this.gen.randomInt(10, 2000)}`,
                neighborhood: 'Consolação',
                city: 'São Paulo',
                state: 'SP',
                zipCode: '01415-000',
                country: 'Brasil',
                firstSaleAt: new Date(Date.now() - this.gen.randomInt(1, 180) * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                __isSystem: true
            }, 'Customers');
            if (id) ids.push(id);
        }
        return ids;
    }
}
