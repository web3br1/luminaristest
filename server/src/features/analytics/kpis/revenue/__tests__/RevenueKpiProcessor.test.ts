import { revenueKpiProcessor } from '../RevenueKpiProcessor';
import { DatePreset } from '../../../utils/DateUtils';

describe('RevenueKpiProcessor', () => {
    const referenceDate = new Date('2024-03-15T12:00:00Z');
    
    const mockRows = [
        { id: '1', data: { totalAmount: 1000, discount: 100, tax: 50, date: '2024-03-01T10:00:00Z', customerId: 'A', revenueType: 'operational', status: 'paid' } },
        { id: '2', data: { totalAmount: 500, discount: 0, tax: 25, date: '2024-03-05T10:00:00Z', customerId: 'B', revenueType: 'operational', status: 'paid' } },
        { id: '3', data: { totalAmount: 300, discount: 50, tax: 15, date: '2024-03-10T10:00:00Z', customerId: 'A', revenueType: 'non-operational', status: 'paid' } },
        { id: 'prev1', data: { totalAmount: 2000, discount: 0, tax: 0, date: '2024-02-15T10:00:00Z', customerId: 'C', revenueType: 'operational', status: 'paid' } },
    ];

    const baseContext: any = {
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
            referenceDate: referenceDate.toISOString()
        },
        table: { id: 'test', name: 'Test' },
        schema: { fields: [] }
    };

    it('should calculate core revenue KPIs correctly', async () => {
        const results = await revenueKpiProcessor(baseContext);
        
        const gross = results.find((r) => r.name === 'Receita Bruta')!;
        const net = results.find((r) => r.name === 'Receita Líquida')!;
        const op = results.find((r) => r.name === 'Receita Operacional')!;
        const nonOp = results.find((r) => r.name === 'Receita Não Operacional')!;
        const growth = results.find((r) => r.name === 'Crescimento da Receita (%)')!;

        expect(gross.value).toBe(1800); // 1000 + 500 + 300
        expect(net.value).toBe(1560);   // (1000-150) + (500-25) + (300-65) = 850 + 475 + 235
        expect(op.value).toBe(1500);    // 1000 + 500
        expect(nonOp.value).toBe(300);
        expect(growth.value).toBe(-10); // ((1800 - 2000) / 2000) * 100
    });

    it('should respect status exclusion', async () => {
        const contextWithExclusion = {
            ...baseContext,
            params: {
                ...baseContext.params,
                excludeStatuses: ['cancelled']
            },
            rows: [
                ...mockRows,
                { id: '4', data: { totalAmount: 5000, date: '2024-03-12T10:00:00Z', status: 'cancelled' } }
            ]
        };

        const results = await revenueKpiProcessor(contextWithExclusion);
        const gross = results.find((r) => r.name === 'Receita Bruta')!;
        
        expect(gross.value).toBe(1800);
    });

    it('should calculate Customer count correctly', async () => {
        const results = await revenueKpiProcessor(baseContext);
        const perCustomer = results.find((r) => r.name === 'Receita por Cliente')!;
        
        // distinct customers in March: A, B (2) | Gross: 1800 | expected: 900
        expect(perCustomer.value).toBe(900);
    });

    it('[B1 FIX] should correctly calculate prevNetRevenue with PT-BR currency strings', async () => {
        const contextWithCurrencyStrings: any = {
            ...baseContext,
            rows: [
                // Current period
                { id: 'c1', data: { totalAmount: 1000, discount: 0, tax: 0, date: '2024-03-01T10:00:00Z', status: 'paid' } },
                // Previous period: discount and tax as PT-BR currency strings
                { id: 'p1', data: { totalAmount: 2000, discount: 'R$ 200,00', tax: 'R$ 100,00', date: '2024-02-10T10:00:00Z', status: 'paid' } },
            ]
        };

        const results = await revenueKpiProcessor(contextWithCurrencyStrings);
        const net = results.find((r) => r.name === 'Receita Líquida')!;
        
        // prevNetRevenue = 2000 - 200 - 100 = 1700
        // Before this fix it would have been 2000 (Number("R$ 200,00") = NaN → 0)
        expect(net.previousValue).toBe(1700);
    });

    it('[B2-B5] KPIs 3, 4, 7, 16 should have previousValue defined when prev data exists', async () => {
        const rowsWith24Months: any[] = [
            ...mockRows,
            // 14 months ago — lands in prevSeries (months 12-23)
            { id: 'prev_annual', data: { totalAmount: 5000, discount: 0, tax: 0, date: '2023-01-10T10:00:00Z', status: 'paid' } },
        ];

        const context: any = {
            ...baseContext,
            params: { ...baseContext.params, referenceDate: new Date('2024-03-15T12:00:00Z').toISOString() },
            rows: rowsWith24Months,
        };

        const results = await revenueKpiProcessor(context);
        
        const annual = results.find((r) => r.name === 'Receita Total Anual')!;
        const avgMonthly = results.find((r) => r.name === 'Receita Média Mensal')!;

        // At minimum, annual and avgMonthly must have a previousValue >= 0 when prev data exists
        expect(annual.previousValue).toBeGreaterThanOrEqual(0);
        expect(avgMonthly.previousValue).toBeGreaterThanOrEqual(0);
    });

    it('[WINDOWS] Receita Total Anual: current and previous windows must be independent and correct', async () => {
        const rowsSpanning2Years: any[] = [
            // Current window (Mar 2024, within last 12 months from 2024-03-15)
            { id: 'c1', data: { totalAmount: 3000, discount: 0, tax: 0, date: '2024-03-01T10:00:00Z', status: 'paid' } },
            // Previous window (Jan 2023, between 12-24 months before reference date)
            { id: 'p1', data: { totalAmount: 1000, discount: 0, tax: 0, date: '2023-01-05T10:00:00Z', status: 'paid' } },
        ];

        const context: any = {
            ...baseContext,
            params: { ...baseContext.params, referenceDate: new Date('2024-03-15T12:00:00Z').toISOString() },
            rows: rowsSpanning2Years,
        };

        const results = await revenueKpiProcessor(context);
        const annual = results.find((r) => r.name === 'Receita Total Anual')!;

        // Current 12-month window = only 3000 (Mar 2024 row)
        // Previous 12-month window = only 1000 (Jan 2023 row)
        expect(annual.value).toBe(3000);
        expect(annual.previousValue).toBe(1000);
    });

    it('[P1 FIX] Crescimento da Receita (%): previousValue should use month-before-last vs month-prior', async () => {
        const rowsGrowth: any[] = [
            // Current month (Mês0) => series[length-1]
            { id: 'c0', data: { totalAmount: 1500, discount: 0, tax: 0, date: '2024-03-20T10:00:00Z', status: 'paid' } },
            // Prev month (Mês-1) => series[length-2]
            { id: 'c1', data: { totalAmount: 1000, discount: 0, tax: 0, date: '2024-02-15T10:00:00Z', status: 'paid' } },
            // Prev-prev month (Mês-2) => series[length-3]
            { id: 'c2', data: { totalAmount: 500, discount: 0, tax: 0, date: '2024-01-10T10:00:00Z', status: 'paid' } },
        ];

        const context: any = {
            ...baseContext,
            params: { ...baseContext.params, referenceDate: new Date('2024-03-31T12:00:00Z').toISOString() },
            rows: rowsGrowth,
        };

        const results = await revenueKpiProcessor(context);
        const growth = results.find((r) => r.name === 'Crescimento da Receita (%)')!;

        // Value: Mês0 (1500) vs Mês-1 (1000) => +50%
        // PreviousValue: Mês-1 (1000) vs Mês-2 (500) => +100%
        expect(growth.value).toBe(50);
        expect(growth.previousValue).toBe(100);
    });

    it('[P3 FIX] Single Source Dependency: should not be 0% when no source field is configured', async () => {
        // Base context without customerIdField nor categoryField nor sourceField
        const noSourceContext: any = {
            ...baseContext,
            params: {
                ...baseContext.params,
                customerIdField: undefined,
                categoryField: undefined,
                sourceField: undefined
            }
        };

        const results = await revenueKpiProcessor(noSourceContext);
        const dependency = results.find((r) => r.name === 'Dependência de Receita de Fonte Única (%)')!;

        // Value should be 0, but previousValue must be undefined since the field is not configured
        expect(dependency.value).toBe(0);
        expect(dependency.previousValue).toBeUndefined();
    });

    describe('Edge Cases (QA Gold Standard)', () => {
        it('[QA-1] The Calendar Bug: Should not skip February when referenceDate is on the 31st of March', async () => {
             const rowsCalendar: any[] = [
                // Mid-Feb transaction 
                { id: 'feb', data: { totalAmount: 1000, discount: 0, tax: 0, date: '2024-02-15T12:00:00Z', status: 'paid' } },
            ];

            const context: any = {
                ...baseContext,
                // Setting reference date to Mar 31st, testing Date.setMonth internal bypasses
                params: { ...baseContext.params, referenceDate: new Date('2024-03-31T23:59:59Z').toISOString() },
                rows: rowsCalendar,
            };

            const results = await revenueKpiProcessor(context);
            // Since thisMonth is Mar 2024, prev window would be 2022-2023. February 2024 belongs to the CURRENT 12-month window.
            const annual = results.find(r => r.name === 'Receita Total Anual')!;
            
            // Should accurately sum 1000 because Feb was correctly mapped into the 12-month current series window
            expect(annual.value).toBe(1000);
        });

        it('[QA-2] The Chargeback Clause: Should exclude negative amounts natively', async () => {
            const rowsNegatives: any[] = [
               { id: '1', data: { totalAmount: 1500, discount: 0, tax: 0, date: '2024-03-10T10:00:00Z', status: 'paid' } },
               // Refund logic shouldn't sum negative amounts to final metric
               { id: 'refund', data: { totalAmount: -200, discount: 0, tax: 0, date: '2024-03-12T10:00:00Z', status: 'paid' } }, 
               { id: 'zero', data: { totalAmount: 0, discount: 0, tax: 0, date: '2024-03-15T10:00:00Z', status: 'paid' } }, 
           ];

           const context: any = {
               ...baseContext,
               params: { ...baseContext.params, referenceDate: new Date('2024-03-20T12:00:00Z').toISOString() },
               rows: rowsNegatives,
           };

           const results = await revenueKpiProcessor(context);
           const gross = results.find(r => r.name === 'Receita Bruta')!;
           
           expect(gross.value).toBe(1500); // Excluded -200
       });

       it('[QA-3] B2B Boundaries: Timezone allocation (midnight leap)', async () => {
            const rowsTZ: any[] = [
                // 1AM in London (UTC) on April 1st => 10PM on March 31st in Sao Paulo (UTC-3)
               { id: 'sp_night', data: { totalAmount: 5000, discount: 0, tax: 0, date: '2024-04-01T01:00:00Z', status: 'paid' } },
            ];

            const contextTZ: any = {
                ...baseContext,
                params: { 
                    ...baseContext.params, 
                    // Emulating manager looking at the dashboard on March 31st local SP time
                    referenceDate: new Date('2024-04-01T01:30:00Z').toISOString(), // 10:30 PM SP TIME
                    timeZone: 'America/Sao_Paulo'
                },
                rows: rowsTZ,
            };

            const results = await revenueKpiProcessor(contextTZ);
            const gross = results.find(r => r.name === 'Receita Bruta')!;

             // It should calculate as part of March (thisMonth preset bounding), completely capturing the 5000 
            expect(gross.value).toBe(5000); 
       });

       it('[QA-4] Empty Rows: Division by zero and NaN shielding', async () => {
            const emptyContext: any = {
                ...baseContext,
                params: { ...baseContext.params },
                rows: [],
            };

            const results = await revenueKpiProcessor(emptyContext);
            
            // Loop testing all returned numbers are valid, finite, and strictly not 0/0 (NaN)
            for (const r of results) {
                expect(Number.isNaN(r.value)).toBe(false);
                expect(Number.isFinite(r.value)).toBe(true);
                
                if (r.previousValue !== undefined) {
                    expect(Number.isNaN(r.previousValue)).toBe(false);
                    expect(Number.isFinite(r.previousValue)).toBe(true);
                }
            }
       });
    });
});
