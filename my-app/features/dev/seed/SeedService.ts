
import { ApiClient } from './utils/ApiClient';
import { DataGenerator } from './utils/DataGenerator';
import { SeedCore } from './modules/SeedCore';
import { SeedPeople } from './modules/SeedPeople';
import { SeedCatalog } from './modules/SeedCatalog';
import { SeedFinancials } from './modules/SeedFinancials';
import { SeedStrategy } from './modules/SeedStrategy';
import { SeedInventory } from './modules/SeedInventory';
import { SeedSales } from './modules/SeedSales';
import { SeedAppointments } from './modules/SeedAppointments';
import { IDynamicTable } from '../../dashboard/components/shared/dynamic-tables.client';

export class SeedService {
    private api: ApiClient;
    private gen: DataGenerator;
    private tables: IDynamicTable[];
    private setMsg: (m: string) => void;

    // Modules
    private core: SeedCore;
    private people: SeedPeople;
    private catalog: SeedCatalog;
    private financials: SeedFinancials;
    private strategy: SeedStrategy;
    private inventory: SeedInventory;
    private sales: SeedSales;
    private appointments: SeedAppointments;

    constructor(tables: IDynamicTable[], setMsg: (m: string) => void) {
        this.api = new ApiClient();
        this.gen = new DataGenerator(Date.now());
        this.tables = tables;
        this.setMsg = setMsg;

        // Init modules
        this.core = new SeedCore(this.api, this.gen);
        this.people = new SeedPeople(this.api, this.gen);
        this.catalog = new SeedCatalog(this.api, this.gen);
        this.financials = new SeedFinancials(this.api, this.gen);
        this.strategy = new SeedStrategy(this.api, this.gen);
        this.inventory = new SeedInventory(this.api, this.gen);
        this.sales = new SeedSales(this.api, this.gen);
        this.appointments = new SeedAppointments(this.api, this.gen);
    }

    private t(name: string): string {
        const t = this.tables.find(t =>
            t.name === name ||
            t.internalName === name ||
            t.key === name ||
            t.key === name.toLowerCase()
        );
        if (!t) throw new Error(`Table "${name}" not found`);
        return t.id;
    }

    async run() {
        this.setMsg('🚀 Iniciando Massive Seed 4.0 (Professional ERP)...');

        // 1. Core Data
        this.setMsg('🌱 Semeando estrutura central (Spas & Staff)...');
        const unitIds = await this.core.seedUnits(this.t('Units'));
        const empIds = await this.core.seedEmployees(this.t('Employees'), unitIds);
        await this.core.seedStakeholders(this.t('Stakeholders'));

        // 2. People
        this.setMsg('👥 Cadastrando ecossistema de pessoas (VIP Customers & Suppliers)...');
        const suppIds = await this.people.seedSuppliers(this.t('Suppliers'));
        const custIds = await this.people.seedCustomers(this.t('Customers'), unitIds, 40);

        // 3. Catalog
        this.setMsg('📦 Semeando catálogo especializado (L\'Oreal, Wella, Corte Designer)...');
        const prodIds = await this.catalog.seedProducts(this.t('Products'), 15);
        const servIds = await this.catalog.seedServices(this.t('Services'), 10);

        // 4. Inventory
        this.setMsg('📦 Abastecendo estoques com movimentos de compra...');
        const puId = this.t('Product Units');
        await this.inventory.seedProductUnits(puId, prodIds, unitIds);

        const stockProducts = prodIds.map(p => ({
            id: p.id,
            initialStock: this.gen.randomInt(300, 1000), // Boosted for high volume
            salePrice: this.gen.randomInt(80, 450)
        }));
        await this.inventory.seedStockMovements(this.t('Stock Movements'), puId, stockProducts, unitIds, suppIds[0] ?? undefined);

        // 5. Operations: Appointments & Sales (Historical - 90 Days)
        this.setMsg('📅 Gerando histórico balanceado (200 operações / 90 dias)...');
        const saleCommissionData: { saleId: string, employeeId: string, amount: number }[] = [];

        // Distribute operations over 90 days
        for (let i = 0; i < 200; i++) {
            const customerId = this.gen.randomElement(custIds);
            const unitId = this.gen.randomElement(unitIds);
            const employeeId = this.gen.randomElement(empIds);

            // Random service and product with metadata
            const service = this.gen.randomElement(servIds);
            const product = this.gen.randomElement(prodIds);

            // Spread dates over the last 90 days
            const daysAgo = this.gen.randomInt(0, 90);
            const hour = this.gen.randomInt(9, 19);
            const pastDateObj = new Date();
            pastDateObj.setDate(pastDateObj.getDate() - daysAgo);
            pastDateObj.setHours(hour, this.gen.randomElement([0, 30]), 0, 0);
            const pastDate = pastDateObj.toISOString();

            // Create Appointment
            const apptStatus = this.gen.randomElement(['Completed', 'Completed', 'Completed', 'Completed', 'No-Show', 'Cancelled']) as 'Completed' | 'No-Show' | 'Cancelled';
            const appointmentId = await this.appointments.seedAppointments(this.t('Appointments'), {
                customerId,
                unitId,
                employeeId,
                serviceId: service.id,
                date: pastDate,
                status: apptStatus
            });

            // Conversion logic (90% create sales for higher balance)
            if (i < 180) {
                const isService = this.gen.randomInt(0, 10) > 3; // 70% services
                const apptIsCloseable = apptStatus === 'Completed' || apptStatus === 'No-Show';

                if (isService && appointmentId && apptIsCloseable) { // Only proceed with service sale if appointment allows
                    const price = Number(service.price || 200);
                    const serviceSaleId = await this.sales.createSale(this.t('Sales'), this.t('Sale Items'), {
                        customerId: customerId,
                        unitId: unitId,
                        employeeId: employeeId,
                        date: pastDate,
                        status: 'Finalized',
                        paymentStatus: 'Paid',
                        items: [
                            {
                                serviceId: service.id,
                                appointmentId: appointmentId, // <--- INJECTED TO FIX VALIDATION ERROR
                                type: 'Service',
                                quantity: 1,
                                unitPrice: price,
                                responsibleEmployeeId: employeeId
                            }
                        ]
                    });

                    if (serviceSaleId) {
                        saleCommissionData.push({
                            saleId: serviceSaleId,
                            employeeId,
                            amount: Math.round(price * 0.4) // 40% commission
                        });
                    }
                } else {
                    // Product Sale
                    const price = this.gen.randomInt(80, 450);
                    const productSaleId = await this.sales.createSale(this.t('Sales'), this.t('Sale Items'), {
                        customerId: customerId,
                        unitId: unitId,
                        employeeId: employeeId,
                        date: pastDate,
                        status: 'Finalized',
                        paymentStatus: 'Paid',
                        items: [
                            {
                                productId: product.id,
                                type: 'Product',
                                quantity: 1,
                                unitPrice: price,
                                responsibleEmployeeId: employeeId
                            }
                        ]
                    });

                    if (productSaleId) {
                        saleCommissionData.push({
                            saleId: productSaleId,
                            employeeId,
                            amount: Math.round(price * 0.1) // 10% commission
                        });
                    }
                }
            }
        }

        // 6. Financials
        this.setMsg('💰 Processando fluxo financeiro (Despesas, Comissões e Baselines)...');
        await this.financials.seedMonthlyExpenses(this.t('Expenses'), unitIds, suppIds[0]);
        await this.financials.seedCommissions(this.t('Commissions'), saleCommissionData);
        await this.financials.seedOtherRevenues(this.t('Other Revenues'), unitIds);
        await this.financials.seedBaselines(this.t('Financial Baselines'), unitIds);

        // 7. Strategy
        this.setMsg('📈 Consolidando estratégia e BI...');
        await this.strategy.seedGoals(this.t('Goals'), unitIds);
        await this.strategy.seedCampaigns(this.t('Campaigns'), unitIds);
        await this.strategy.seedReports(this.t('Reports'));

        this.setMsg('📋 Organizando o Kanban operacional...');
        const tasksId = this.t('Tasks');
        if (tasksId) {
            await this.api.postRow(tasksId, {
                name: 'Revisão Trimestral de Estoque',
                description: 'Verificar divergências entre físico e sistema após carga inicial.',
                status: 'To Do',
                priority: 'High',
                date: new Date().toISOString(),
                assigneeId: empIds[0]
            }, 'Tasks');
        }

        this.setMsg('✨ ERP PRONTO! Dados profissionais gerados com sucesso. 🚀');
    }
}
