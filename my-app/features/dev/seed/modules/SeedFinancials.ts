
import { ApiClient } from '../utils/ApiClient';
import { DataGenerator } from '../utils/DataGenerator';

export class SeedFinancials {
    private api: ApiClient;
    private gen: DataGenerator;

    constructor(api: ApiClient, gen: DataGenerator) {
        this.api = api;
        this.gen = gen;
    }

    async seedMonthlyExpenses(expensesId: string, units: string[], supplierId: string) {
        console.log('[SeedFinancials] Seeding Operational Expenses...');
        const templates = [
            { desc: 'Aluguel Comercial - Jardins', cat: 'Fixed Cost', amount: 8000 },
            { desc: 'Conta de Energia (Enel)', cat: 'Variable Cost', amount: 1200 },
            { desc: 'Marketing Instagram/Ads', cat: 'Marketing', amount: 2500 },
            { desc: 'Produtos de Limpeza VIP', cat: 'Variable Cost', amount: 600 },
            { desc: 'Folha de Pagamento Adiantamento', cat: 'Personnel', amount: 12000 },
            { desc: 'Imposto Simples Nacional', cat: 'Taxes', amount: 4500 }
        ];
        const months = 4;

        for (let m = 0; m < months; m++) {
            const date = new Date();
            date.setMonth(date.getMonth() - m);
            date.setDate(5);

            for (const uId of units) {
                for (const t of templates) {
                    await this.api.postRow(expensesId, {
                        unitId: uId,
                        description: t.desc,
                        category: t.cat,
                        amount: t.amount + this.gen.randomInt(-200, 500),
                        paymentDate: date.toISOString(),
                        paymentStatus: 'Paid',
                        budgetGroup: t.cat, // Use category as budget group for seeding
                        isPlanned: true,
                        __isSystem: true
                    }, 'Expenses');
                }
            }
        }
    }

    async seedCommissions(cid: string, saleData: { saleId: string, employeeId: string, amount: number }[]) {
        console.log('[SeedFinancials] Seeding calculated Commissions...');
        for (const data of saleData) {
            await this.api.postRow(cid, {
                employeeId: data.employeeId,
                saleId: data.saleId,
                amount: data.amount,
                status: this.gen.randomElement(['Approved', 'Paid']),
                paidAt: new Date().toISOString(),
                notes: 'Comissão gerada automaticamente via venda finalizada.'
            }, 'Commissions');
        }
    }

    async seedOtherRevenues(rid: string, unitIds: string[]) {
        console.log('[SeedFinancials] Seeding distributed Non-Operational Revenues...');
        for (let m = 0; m < 3; m++) {
            const date = new Date();
            date.setMonth(date.getMonth() - m);
            date.setDate(15);

            for (const unitId of unitIds) {
                await this.api.postRow(rid, {
                    unitId,
                    description: m === 0 ? 'Royalties de Franquia - Atual' : `Royalties de Franquia - Mês M-${m}`,
                    amount: 7500 + this.gen.randomInt(-500, 500),
                    type: 'Rent',
                    source: 'Franqueado Master SP',
                    date: date.toISOString().split('T')[0],
                    __isSystem: true
                }, 'Other Revenues');
            }
        }
    }

    async seedBaselines(bid: string, unitIds: string[]) {
        console.log('[SeedFinancials] Seeding monthly Financial Baselines...');
        for (let m = 0; m < 4; m++) {
            const date = new Date();
            date.setMonth(date.getMonth() - m);
            date.setDate(1);

            for (const unitId of unitIds) {
                await this.api.postRow(bid, {
                    unitId,
                    date: date.toISOString().split('T')[0],
                    openingCash: 250000 + (m * 15000), // Show growth
                    equity: 1200000 + (m * 20000),
                    liabilities: 45000 - (m * 2000),
                    notes: `Carga de baseline mensal para M-${m}`,
                    __isSystem: true
                }, 'Financial Baselines');
            }
        }
    }
}
