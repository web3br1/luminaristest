import { cashflowKpiProcessor } from '../features/analytics/kpis/cashflow/CashflowKpiProcessor';
import { DatePreset } from '../features/analytics/utils/DateUtils';

async function runCashflowAudit() {
    console.log('--- CASHFLOW KPI AUDIT START ---');
    
    // Baseline: March 15, 2024
    const now = new Date('2024-03-15T12:00:00Z');
    
    // Ground Truth Data (March)
    // Paid Sales (Inflow): 5000 + 2000 = 7000
    // Pending Sales (Receivables Stock): 3000
    const mockSalesRows = [
        { id: 's1', data: { totalAmount: 5000, date: '2024-03-01T10:00:00Z', paymentStatus: 'Paid' } },
        { id: 's2', data: { totalAmount: 2000, date: '2024-03-10T10:00:00Z', paymentStatus: 'Paid' } },
        { id: 's3', data: { totalAmount: 3000, date: '2024-03-14T10:00:00Z', paymentStatus: 'Pending' } },
    ];

    // Expenses: 
    // Paid Operational: 1000 + 500 + 1000 + 500 + 200 = 3200
    // Paid Investment (Capex): 1000 = 1000
    // Total Paid Outflow: 4200
    // Pending Expenses (Payables Stock): 2000
    const mockExpenseRows = [
        { id: 'e1', data: { amount: 1000, category: 'Marketing', date: '2024-03-02T10:00:00Z', paymentStatus: 'Paid' } },
        { id: 'e2', data: { amount: 500, category: 'Sup', date: '2024-03-05T10:00:00Z', paymentStatus: 'Paid' } },
        { id: 'e3', data: { amount: 1000, category: 'Aluguel', date: '2024-03-10T10:00:00Z', paymentStatus: 'Paid' } },
        { id: 'e4', data: { amount: 500, category: 'Imposto', date: '2024-03-12T10:00:00Z', paymentStatus: 'Paid' } },
        { id: 'e5', data: { amount: 200, category: 'Manutenção', date: '2024-03-13T10:00:00Z', paymentStatus: 'Paid' } },
        { id: 'e6', data: { amount: 1000, category: 'Capex Investment', date: '2024-03-14T10:00:00Z', paymentStatus: 'Paid' } }, // Investment

        { id: 'e7', data: { amount: 2000, category: 'Fornecedor', date: '2024-03-15T10:00:00Z', paymentStatus: 'Pending' } },
    ];

    const context = {
        rows: mockSalesRows,
        params: {
            salesAmountField: 'totalAmount',
            salesDateField: 'date',
            salesPaymentStatusField: 'paymentStatus',
            expenseAmountField: 'amount',
            expenseDateField: 'date',
            expensePaymentStatusField: 'paymentStatus',
            expenseCategoryField: 'category',
            datePreset: 'thisMonth' as DatePreset,
            referenceDate: now.toISOString(),
            expensesTableKey: 'expenses',
            initialCashBalance: 10000
        },
        table: { id: 'sales_table', name: 'Sales' } as any,
        schema: { fields: [] } as any,
        fetchByPresetTableKey: async (key: string) => {
            if (key === 'expenses') {
                return {
                    rows: mockExpenseRows,
                    schema: {} as any,
                    table: {} as any
                };
            }
            return { rows: [], schema: {} as any, table: {} as any };
        }
    };

    const results = await cashflowKpiProcessor(context);

    // Initial Cash: 10000
    // Absolute Inflow: 7000
    // Absolute Outflow: 4200
    // Expected Balance: 10000 + 7000 - 4200 = 12800

    const check = (name: string, expected: number) => {
        const found = results.find(r => r.name === name);
        if (!found) {
            console.error(`[FAIL] KPI not found: ${name}`);
            return false;
        }
        const diff = Math.abs(found.value - expected);
        if (diff > 0.01) {
            console.error(`[FAIL] ${name}: Expected ${expected}, got ${found.value}`);
            return false;
        }
        console.log(`[PASS] ${name}: ${found.value}`);
        return true;
    };

    let allPassed = true;
    allPassed = check('Fluxo de Caixa Operacional', 7000 - 3200) && allPassed;
    allPassed = check('Fluxo de Caixa Livre', (7000 - 3200) - 1000) && allPassed;
    allPassed = check('Saldo de Caixa', 12800) && allPassed;
    allPassed = check('Contas a Pagar Total', 2000) && allPassed;
    allPassed = check('Contas a Receber Total', 3000) && allPassed;

    if (allPassed) {
        console.log('\n✅ CASHFLOW KPI GROUND TRUTH VERIFIED.');
        process.exit(0);
    } else {
        console.log('\n❌ CASHFLOW KPI AUDIT FAILED.');
        process.exit(1);
    }
}

runCashflowAudit().catch(err => {
    console.error(err);
    process.exit(1);
});
