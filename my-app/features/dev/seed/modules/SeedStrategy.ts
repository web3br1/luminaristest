
import { ApiClient } from '../utils/ApiClient';
import { DataGenerator } from '../utils/DataGenerator';

export class SeedStrategy {
    private api: ApiClient;
    private gen: DataGenerator;

    constructor(api: ApiClient, gen: DataGenerator) {
        this.api = api;
        this.gen = gen;
    }

    async seedGoals(gid: string, unitIds: string[]) {
        console.log('[SeedStrategy] Seeding Professional Strategic Goals...');
        const templates = [
            { desc: 'Faturamento Mensal (Vendas)', target: 120000, period: 'Monthly' },
            { desc: 'Taxa de Retenção de Clientes', target: 85, period: 'Monthly' },
            { desc: 'Expansão de Unidades (Projeção)', target: 1, period: 'Yearly' },
            { desc: 'Venda de Produtos Core L\'Oreal', target: 15000, period: 'Weekly' }
        ];

        for (const unitId of unitIds) {
            for (const t of templates) {
                await this.api.postRow(gid, {
                    description: t.desc,
                    unitId,
                    period: t.period,
                    targetAmount: t.target,
                    startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                    endDate: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                    actualAmount: this.gen.randomInt(t.target * 0.4, t.target * 0.9),
                    result: 'Partial',
                    __isSystem: true
                }, 'Goals');
            }
        }
    }

    async seedCampaigns(cid: string, unitIds: string[]) {
        console.log('[SeedStrategy] Seeding Marketing Campaigns...');
        const campaigns = [
            { name: 'Redes Sociais: Glow Summer 2026', channel: 'Instagram', budget: 3500 },
            { name: 'Google Ads: Melhores Mechas Jardins', channel: 'Google Ads', budget: 2200 },
            { name: 'Promoção: Dia da Mulher Studio Concept', channel: 'Facebook', budget: 4000 }
        ];

        for (const c of campaigns) {
            await this.api.postRow(cid, {
                name: c.name,
                channel: c.channel,
                budget: c.budget,
                unitId: this.gen.randomElement(unitIds),
                startDate: new Date().toISOString().split('T')[0],
                endDate: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
                status: 'Active',
                __isSystem: true
            }, 'Campaigns');
        }
    }

    async seedReports(rid: string) {
        console.log('[SeedStrategy] Seeding System Reports...');
        const reports = [
            { description: 'Consolidado Mensal de Faturamento - Fevereiro 2026', type: 'Monthly Revenue' },
            { description: 'Análise de Ocupação por Profissional (Jan/2026)', type: 'Professional Occupancy' },
            { description: 'Análise de Performance de Campanhas (Q1)', type: 'Campaign Performance' }
        ];

        for (const r of reports) {
            await this.api.postRow(rid, {
                type: r.type,
                description: r.description,
                __isSystem: true
            }, 'Reports');
        }
    }
}
