import { profitKpiProcessor } from '../features/analytics/kpis/profit/ProfitKpiProcessor';
import { DatePreset } from '../features/analytics/utils/DateUtils';

async function runProfitAudit() {
    console.log('--- PROFIT KPI AUDIT START ---');
    
    // Baseline: March 15, 2024
    const now = new Date('2024-03-15T12:00:00Z');
    
    // Ground Truth Data (March)
    // Revenue: 5000 + 2000 = 7000
    const mockSalesRows = [
        { id: 's1', data: { totalAmount: 5000, date: '2024-03-01T10:00:00Z', status: 'Finalized', paymentStatus: 'Paid' } },
        { id: 's2', data: { totalAmount: 2000, date: '2024-03-10T10:00:00Z', status: 'Finalized', paymentStatus: 'Paid' } },
        { id: 's3', data: { totalAmount: 1000, date: '2024-02-15T10:00:00Z', status: 'Finalized', paymentStatus: 'Paid' } }, // Prev month (Feb)
    ];

    // Expenses: 
    // Variable: 1000 + 500 = 1500
    // Fixed: 1000
    // Taxes: 500
    // Non-recurring: 200
    const mockExpenseRows = [
        { id: 'e1', data: { amount: 1000, category: 'Marketing Variable', paymentDate: '2024-03-02T10:00:00Z', paymentStatus: 'Paid' } },
        { id: 'e2', data: { amount: 500, category: 'Sup Variable', paymentDate: '2024-03-05T10:00:00Z', paymentStatus: 'Paid' } },
        { id: 'e3', data: { amount: 1000, category: 'Aluguel Fixed', paymentDate: '2024-03-10T10:00:00Z', paymentStatus: 'Paid' } },
        { id: 'e4', data: { amount: 500, category: 'ISS Tax', paymentDate: '2024-03-12T10:00:00Z', paymentStatus: 'Paid' } },
        { id: 'e5', data: { amount: 200, category: 'Manutenção Nonrecurring', paymentDate: '2024-03-14T10:00:00Z', paymentStatus: 'Paid' } },
        
        { id: 'e6', data: { amount: 500, category: 'Marketing Variable', paymentDate: '2024-02-15T10:00:00Z', paymentStatus: 'Paid' } }, // Prev month (Feb)
    ];

    const context = {
        rows: mockSalesRows,
        params: {
            revenueAmountField: 'totalAmount',
            revenueDateField: 'date',
            statusField: 'status',
            paymentStatusField: 'paymentStatus',
            datePreset: 'thisMonth' as DatePreset,
            referenceDate: now.toISOString(),
            costSourceTableKey: 'expenses'
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

    const results = await profitKpiProcessor(context);

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
    allPassed = check('Lucro Bruto', 7000 - 1500) && allPassed;
    allPassed = check('Lucro Operacional', (7000 - 1500) - 1000) && allPassed;
    allPassed = check('Lucro Líquido', ((7000 - 1500) - 1000) - 500) && allPassed;
    allPassed = check('Margem Bruta (%)', ((7000 - 1500) / 7000) * 100) && allPassed;
    allPassed = check('Lucro Ajustado', (((7000 - 1500) - 1000) - 500) - 200) && allPassed;

    if (allPassed) {
        console.log('\n✅ PROFIT KPI GROUND TRUTH VERIFIED.');
        process.exit(0);
    } else {
        console.log('\n❌ PROFIT KPI AUDIT FAILED.');
        process.exit(1);
    }
}

runProfitAudit().catch(err => {
    console.error(err);
    process.exit(1);
});
