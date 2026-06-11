import { revenueKpiProcessor } from '../features/analytics/kpis/revenue/RevenueKpiProcessor';
import { DatePreset, getPeriodBoundaries } from '../features/analytics/utils/DateUtils';

async function runAudit() {
    console.log('--- REVENUE KPI AUDIT START ---');
    
    const now = new Date('2024-03-15T12:00:00Z');
    const boundaries = getPeriodBoundaries('thisMonth', now);
    
    const mockRows = [
        { id: 'c1', data: { totalAmount: 1000, discount: 100, tax: 50, date: '2024-03-01T10:00:00Z', customerId: 'customer_a', revenueType: 'operational', status: 'paid' } },
        { id: 'c2', data: { totalAmount: 500, discount: 0, tax: 25, date: '2024-03-05T10:00:00Z', customerId: 'customer_b', revenueType: 'operational', status: 'paid' } },
        { id: 'c3', data: { totalAmount: 300, discount: 50, tax: 15, date: '2024-03-10T10:00:00Z', customerId: 'customer_a', revenueType: 'non-operational', status: 'paid' } },
        { id: 'p1', data: { totalAmount: 1200, discount: 120, tax: 60, date: '2024-02-15T10:00:00Z', customerId: 'customer_c', revenueType: 'operational', status: 'paid' } },
        { id: 'p2', data: { totalAmount: 800, discount: 0, tax: 40, date: '2024-02-20T10:00:00Z', customerId: 'customer_a', revenueType: 'operational', status: 'paid' } },
    ];

    const context = {
        rows: mockRows,
        params: {
            amountField: 'totalAmount',
            discountField: 'discount',
            taxField: 'tax',
            dateField: 'date',
            customerIdField: 'customerId',
            revenueTypeField: 'revenueType',
            statusField: 'status',
            datePreset: 'thisMonth' as DatePreset,
            referenceDate: now.toISOString()
        },
        table: { id: 'test_table', name: 'Sales Audit' } as any,
        schema: { fields: [] } as any
    };

    const resultsRaw = revenueKpiProcessor(context);
    const results = Array.isArray(resultsRaw) ? resultsRaw : await resultsRaw;

    const check = (name: string, expected: number) => {
        const found = results.find((r: any) => r.name === name);
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
    allPassed = check('Receita Bruta', 1800) && allPassed;
    allPassed = check('Receita Líquida', 1560) && allPassed;
    allPassed = check('Receita Operacional', 1500) && allPassed;
    allPassed = check('Receita Não Operacional', 300) && allPassed;
    allPassed = check('Crescimento da Receita (%)', -10) && allPassed;

    if (allPassed) {
        console.log('\n✅ ALL CORE CALCULATIONS VERIFIED AGAINST GROUND TRUTH.');
        process.exit(0);
    } else {
        console.log('\n❌ AUDIT FAILED.');
        process.exit(1);
    }
}

runAudit().catch(err => {
    console.error(err);
    process.exit(1);
});
