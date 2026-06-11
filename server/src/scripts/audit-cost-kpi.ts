import { costKpiProcessor } from '../features/analytics/kpis/cost/CostKpiProcessor';
import { DatePreset, getPeriodBoundaries } from '../features/analytics/utils/DateUtils';

async function runCostAudit() {
    console.log('--- COST KPI AUDIT START ---');
    
    // Baseline: March 15, 2024
    const now = new Date('2024-03-15T12:00:00Z');
    
    // Ground Truth Data (March)
    // 1. Fixed: 1000 (Fixo)
    // 2. Variable: 500 (Marketing) - This is the "Custo Variável Total"
    // 3. Admin: 300 (Admin)
    // 4. Tax: 200 (Imposto)
    // 5. Unplanned: 100 (Ad-hoc)
    // Total March: 2100
    
    // Appointments Ground Truth: 5 appointments in March
    
    const mockRows = [
        { id: 'c1', data: { amount: 1000, category: 'Aluguel Fixo', paymentDate: '2024-03-01T10:00:00Z', isPlanned: true } },
        { id: 'c2', data: { amount: 500, category: 'Marketing Digital', paymentDate: '2024-03-05T10:00:00Z', isPlanned: true } },
        { id: 'c3', data: { amount: 300, category: 'Papelaria Administrativo', paymentDate: '2024-03-10T10:00:00Z', isPlanned: true } },
        { id: 'c4', data: { amount: 200, category: 'ISS Imposto', paymentDate: '2024-03-12T10:00:00Z', isPlanned: true } },
        { id: 'c5', data: { amount: 100, category: 'Manutenção Emergencial', paymentDate: '2024-03-14T10:00:00Z', isPlanned: false } },
        
        { id: 'p1', data: { amount: 1000, category: 'Aluguel Fixo', paymentDate: '2024-02-15T10:00:00Z', isPlanned: true } },
    ];

    const context = {
        rows: mockRows,
        params: {
            amountField: 'amount',
            categoryField: 'category',
            paymentDateField: 'paymentDate',
            isPlannedField: 'isPlanned',
            datePreset: 'thisMonth' as DatePreset,
            referenceDate: now.toISOString(),
            appointmentsTableKey: 'appointments'
        },
        table: { id: 'expenses_table', name: 'Costs Audit' } as any,
        schema: { fields: [] } as any,
        fetchByPresetTableKey: async (key: string) => {
            if (key === 'appointments') {
                return {
                    rows: [
                        { id: 'a1', data: { date: '2024-03-02' } },
                        { id: 'a2', data: { date: '2024-03-04' } },
                        { id: 'a3', data: { date: '2024-03-06' } },
                        { id: 'a4', data: { date: '2024-03-08' } },
                        { id: 'a5', data: { date: '2024-03-10' } },
                    ],
                    schema: {} as any,
                    table: {} as any
                };
            }
            return { rows: [], schema: {} as any, table: {} as any };
        }
    };

    const results = await costKpiProcessor(context);

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
    allPassed = check('Custo Total', 2100) && allPassed;
    allPassed = check('Custo Fixo Total', 1000) && allPassed;
    allPassed = check('Custo Variável Total', 500) && allPassed;
    allPassed = check('Impostos Totais Pagos', 200) && allPassed;
    allPassed = check('Custo Não Planejado (%)', (100 / 2100) * 100) && allPassed;
    allPassed = check('Despesas Operacionais Totais', 500 + 300 + 100) && allPassed; // Variable + Admin + Maintenance
    allPassed = check('Custo Variável Médio por Atendimento', 500 / 5) && allPassed; // 500 variable / 5 appointments

    if (allPassed) {
        console.log('\n✅ COST KPI GROUND TRUTH VERIFIED (INC. CROSS-TABLE).');
        process.exit(0);
    } else {
        console.log('\n❌ COST KPI AUDIT FAILED.');
        process.exit(1);
    }
}

runCostAudit().catch(err => {
    console.error(err);
    process.exit(1);
});
