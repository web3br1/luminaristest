
import { ApiClient } from '../utils/ApiClient';
import { DataGenerator } from '../utils/DataGenerator';

export class SeedCore {
    private api: ApiClient;
    private gen: DataGenerator;

    constructor(api: ApiClient, gen: DataGenerator) {
        this.api = api;
        this.gen = gen;
    }

    async seedUnits(uid: string): Promise<string[]> {
        console.log('[SeedCore] Seeding Units...');
        const units = [
            { name: 'Luxe Beauty Jardins', address: 'Alameda Lorena, 1500', city: 'São Paulo', state: 'SP', type: 'Own' },
            { name: 'Studio Concept - Shopping Iguatemi', address: 'Av. Brg. Faria Lima, 2232', city: 'São Paulo', state: 'SP', type: 'Franchise' },
            { name: 'Wellness Spa Vila Nova', address: 'Rua Domingos Leme, 450', city: 'São Paulo', state: 'SP', type: 'Own' }
        ];

        const unitIds: string[] = [];
        for (const u of units) {
            const existing = await this.api.findExisting(uid, 'name', u.name);
            if (existing) {
                unitIds.push(existing.id);
                continue;
            }
            const id = await this.api.postRow(uid, { ...u, isActive: true }, 'Units');
            if (id) unitIds.push(id);
        }
        return unitIds;
    }

    async seedEmployees(eid: string, unitIds: string[]): Promise<string[]> {
        console.log('[SeedCore] Seeding Employees...');
        const employees: string[] = [];
        const roleTemplates = [
            { role: 'Gerente Geral', cost: 8500, sc: 5, pc: 10 },
            { role: 'Senior Stylist', cost: 4500, sc: 40, pc: 10 },
            { role: 'Color Specialist', cost: 4200, sc: 35, pc: 10 },
            { role: 'Técnico de Estética', cost: 3800, sc: 30, pc: 5 },
            { role: 'Manicure Senior', cost: 2800, sc: 45, pc: 15 },
            { role: 'Recepcionista Executiva', cost: 3200, sc: 0, pc: 5 }
        ];

        for (const unitId of unitIds) {
            for (const template of roleTemplates) {
                const name = this.gen.generateNames(1)[0];
                const data = {
                    name,
                    role: template.role,
                    email: this.gen.emailFromName(name),
                    unitId,
                    isActive: true,
                    serviceCommission: template.sc,
                    productCommission: template.pc,
                    monthlyCost: template.cost,
                    startDate: new Date(Date.now() - this.gen.randomInt(30, 730) * 24 * 60 * 60 * 1000).toISOString().split('T')[0]
                };
                const id = await this.api.postRow(eid, data, 'Employees');
                if (id) employees.push(id);
            }
        }
        return employees;
    }

    async seedStakeholders(sid: string): Promise<string[]> {
        console.log('[SeedCore] Seeding Stakeholders...');
        const stakeholders = [
            { name: 'Investidor Principal', role: 'Sócio', company: 'Holding Beleza LTDA' },
            { name: 'Consultor Regional', role: 'Consultor', company: 'ERP Solutions' }
        ];

        const ids: string[] = [];
        for (const s of stakeholders) {
            const existing = await this.api.findExisting(sid, 'name', s.name);
            if (existing) {
                ids.push(existing.id);
                continue;
            }
            const id = await this.api.postRow(sid, { ...s, email: this.gen.emailFromName(s.name) }, 'Stakeholders');
            if (id) ids.push(id);
        }
        return ids;
    }
}
