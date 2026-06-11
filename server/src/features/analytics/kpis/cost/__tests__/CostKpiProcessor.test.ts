import { costKpiProcessor } from '../CostKpiProcessor';

describe('CostKpiProcessor (QA Gold Standard)', () => {
    // Current period bounds
    const now = new Date('2024-03-15T12:00:00Z');

    // Mocks for cross-table references
    const mockAppointmentsTableKey = 'appointments-mock';
    const fetchByPresetTableKeyMock = async (tableKey: string) => {
        if (tableKey === mockAppointmentsTableKey) {
            return {
                rows: [
                    { id: 'A1', data: { date: '2024-03-05T10:00:00Z' } },
                    { id: 'A2', data: { date: '2024-03-12T10:00:00Z' } },
                    // 1 in prev month
                    { id: 'A3', data: { date: '2024-02-15T10:00:00Z' } },
                ]
            };
        }
        return { rows: [] };
    };

    // Construct mock data designed to test exact scenarios
    const mockCostRows = [
        // CURRENT MONTH (March 2024)
        { id: 'C1', data: { amount: 2000, category: 'fixed', isPlanned: true, paymentDate: '2024-03-01T10:00:00Z', status: 'Paid' } },
        { id: 'C2', data: { amount: 'R$ 1.500,00', category: 'variable', isPlanned: true, paymentDate: '2024-03-10T10:00:00Z', status: 'Paid' } }, // string fraud safety
        { id: 'C3', data: { amount: 500, category: 'admin', isPlanned: false, paymentDate: '2024-03-12T10:00:00Z', status: 'Paid' } }, // unplanned
        { id: 'C_FRAUD', data: { amount: -500, category: 'fixed', isPlanned: true, paymentDate: '2024-03-01T10:00:00Z', status: 'Paid' } }, // negative skip
        // PREVIOUS MONTH (Feb 2024)
        { id: 'P1', data: { amount: 2000, category: 'fixed', isPlanned: true, paymentDate: '2024-02-01T10:00:00Z', status: 'Paid' } },
        { id: 'P2', data: { amount: 500, category: 'variable', isPlanned: true, paymentDate: '2024-02-10T10:00:00Z', status: 'Paid' } }, // Variable decreased
        { id: 'P3', data: { amount: 500, category: 'admin', isPlanned: true, paymentDate: '2024-02-12T10:00:00Z', status: 'Paid' } }, // Planned last month
        // HISTORICAL (Jan 2024) - used to test Average calculation
        { id: 'H1', data: { amount: 2000, category: 'fixed', isPlanned: true, paymentDate: '2024-01-01T10:00:00Z', status: 'Paid' } },
        { id: 'EXCLUDE', data: { amount: 9999, category: 'fixed', isPlanned: true, paymentDate: '2024-03-01T10:00:00Z', status: 'Cancelled' } }, // Excluded status
    ];

    const baseContext: any = {
        rows: mockCostRows,
        params: {
            amountField: 'amount',
            categoryField: 'category',
            paymentDateField: 'paymentDate',
            isPlannedField: 'isPlanned',
            statusField: 'status',
            excludeStatuses: ['Cancelled'],
            datePreset: 'thisMonth',
            monthsWindow: 24,
            referenceDate: now.toISOString(),
            timeZone: 'UTC', // deterministic timezone for tests
            appointmentsTableKey: mockAppointmentsTableKey
        },
        table: { id: 'test_expenses', name: 'Expenses' },
        schema: { fields: [] },
        fetchByPresetTableKey: fetchByPresetTableKeyMock,
    };

    it('[Math Suite] should perform accumulation exactly without float point drift', async () => {
        const results = await costKpiProcessor(baseContext);

        const totalCost = results.find((r) => r.name === 'Custo Total')!;
        const fixedTotal = results.find((r) => r.name === 'Custo Fixo Total')!;
        const variableTotal = results.find((r) => r.name === 'Custo Variável Total')!;
        
        // C1 (2000) + C2 (1500 from R$ string) + C3 (500) = 4000
        expect(totalCost.value).toBe(4000);
        expect(fixedTotal.value).toBe(2000); // 2000 C1
        expect(variableTotal.value).toBe(1500); // 1500 C2 -> string parsed!
        
        // PIDs (Prev)
        // P1 (2000) + P2 (500) + P3 (500) = 3000
        expect(totalCost.previousValue).toBe(3000);
        
        // Excluded & Fraud bypassed
        expect(totalCost.value).not.toBe(13999); // 4000 + 9999 would mean exclude failed
        expect(totalCost.value).not.toBe(3500); // 4000 - 500 would mean negative fraud bypassed
    });

    it('[Average Suite] should calculate actual historical monthly average based on active months', async () => {
        const results = await costKpiProcessor(baseContext);
        
        const fixedAvg = results.find((r) => r.name === 'Custo Fixo Médio Mensal')!;
        
        // We have 3 months of Fixed data
        // March: 2000
        // Feb: 2000
        // Jan: 2000
        // Total history = 6000. Divided by 3 active months = 2000.
        // If the legacy division bug existed (6000 / 24 window), result would be 250.
        expect(fixedAvg.value).toBe(2000);
    });

    it('[Trend Suite & Edge Cases] should compute previousValue for margins and unit economics', async () => {
        const results = await costKpiProcessor(baseContext);

        const fixedPct = results.find((r) => r.name === 'Participação dos Custos Fixos (%)')!;
        const unplannedPct = results.find((r) => r.name === 'Custo Não Planejado (%)')!;
        const varPerAppt = results.find((r) => r.name === 'Custo Variável Médio por Atendimento')!;

        // Fixed Pct (Current): 2000 / 4000 = 50%
        expect(fixedPct.value).toBe(50);
        // Fixed Pct (Prev): 2000 / 3000 = 66.66%
        expect(fixedPct.previousValue).toBeCloseTo(66.67, 2);

        // Unplanned Pct (Current): 500 / 4000 = 12.5%
        expect(unplannedPct.value).toBeCloseTo(12.5, 2);
        // Unplanned Pct (Prev): 0 / 3000 = 0%
        expect(unplannedPct.previousValue).toBe(0);

        // Unit Economics (Appointments)
        // Current: Var (1500) / 2 appointments (A1, A2) = 750
        expect(varPerAppt.value).toBe(750);
        // Prev: Var (500) / 1 appointment (A3) = 500
        expect(varPerAppt.previousValue).toBe(500);
    });

    it('[Empty Safety Suite] should fallback to 0 safely without NaN on missing data', async () => {
        const emptyContext = {
            ...baseContext,
            rows: [], // completely empty
            params: {
                ...baseContext.params,
                appointmentsTableKey: 'nobody-home' // trigger empty appointments
            }
        };

        const results = await costKpiProcessor(emptyContext);

        const fixedPct = results.find((r) => r.name === 'Participação dos Custos Fixos (%)')!;
        const unplannedPct = results.find((r) => r.name === 'Custo Não Planejado (%)')!;
        
        expect(fixedPct.value).toBe(0); // Protect against NaN (divide by 0)
        expect(fixedPct.previousValue).toBeUndefined(); // Trend Arrow turns off gracefully
        
        expect(unplannedPct.value).toBe(0); 
    });

    it('[Config Safety] should emit 0% unplanned if isPlannedField is missing instead of 100%', async () => {
        const unboundContext = {
            ...baseContext,
            params: {
                ...baseContext.params,
                isPlannedField: undefined // field unset in template
            }
        };

        const results = await costKpiProcessor(unboundContext);
        const unplannedPct = results.find((r) => r.name === 'Custo Não Planejado (%)')!;

        // Even though no records have isPlanned flagged (due to missing field), KPI should not panic to 100%
        expect(unplannedPct.value).toBe(0);
        expect(unplannedPct.previousValue).toBeUndefined();
    });
});
