import { revenueKpiProcessor } from '../../revenue/RevenueKpiProcessor'; // used for mock comparison if needed
import { profitKpiProcessor } from '../ProfitKpiProcessor';
import { DatePreset } from '../../../utils/DateUtils';

describe('ProfitKpiProcessor (QA Gold Standard)', () => {
    const referenceDate = new Date('2024-03-15T12:00:00Z');
    
    // Revenue mock
    const mockRevenueRows = [
        { id: 'R1', data: { totalAmount: 10000, date: '2024-03-01T10:00:00Z', status: 'finalized', paymentStatus: 'paid', customerId: 'C1' } }, // Current
        { id: 'R2', data: { totalAmount: 8500, date: '2024-02-15T10:00:00Z', status: 'finalized', paymentStatus: 'paid', customerId: 'C1' } },  // Previous
    ];

    const mockExpenseRows = [
        { id: 'E1', data: { amount: 2000, category: 'variable', paymentDate: '2024-03-05T10:00:00Z', paymentStatus: 'paid' } }, // Current COGS
        { id: 'E2', data: { amount: 3000, category: 'fixed/aluguel', paymentDate: '2024-03-10T10:00:00Z', paymentStatus: 'paid' } }, // Current Fixed
        { id: 'E3', data: { amount: 1000, category: 'tax/imposto', paymentDate: '2024-03-12T10:00:00Z', paymentStatus: 'paid' } }, // Current Tax

        { id: 'E4', data: { amount: 1500, category: 'variable', paymentDate: '2024-02-10T10:00:00Z', paymentStatus: 'paid' } }, // Prev COGS
        { id: 'E5', data: { amount: 3000, category: 'fixed/aluguel', paymentDate: '2024-02-12T10:00:00Z', paymentStatus: 'paid' } }, // Prev Fixed
        { id: 'E6', data: { amount: 1200, category: 'tax/imposto', paymentDate: '2024-02-15T10:00:00Z', paymentStatus: 'paid' } }, // Prev Tax
    ];

    const baseContext: any = {
        rows: mockRevenueRows,
        params: {
            amountField: 'totalAmount',
            dateField: 'date',
            statusField: 'status',
            datePreset: 'thisMonth' as DatePreset,
            referenceDate: referenceDate.toISOString(),
            costSourceTableKey: 'mock-expenses', // mock trigger
            requireFinalized: false,
        },
        table: { id: 'test_sales', name: 'Sales' },
        schema: { fields: [] },
        fetchByPresetTableKey: async (tableKey: string) => {
            if (tableKey === 'mock-expenses') return { rows: mockExpenseRows };
            return { rows: [] };
        }
    };

    // No longer using global fetch mock

    it('[Math Suite] should calculate core profitability logic accurately', async () => {
        const results = await profitKpiProcessor(baseContext);
        
        const gross = results.find((r) => r.name === 'Lucro Bruto')!;
        console.log("TEST RESULTS GROSS", gross);
        const op = results.find((r) => r.name === 'Lucro Operacional')!;
        const net = results.find((r) => r.name === 'Lucro Líquido')!;
        
        // Assert: Receita(10000) - Var(2000) = 8000
        expect(gross.value).toBe(8000); 
        // Assert: Gross(8000) - Fix(3000) = 5000
        expect(op.value).toBe(5000);
        // Assert: Op(5000) - Tax(1000) = 4000
        expect(net.value).toBe(4000);

        // Previous validation
        // PrevRev(8500) - PrevVar(1500) = 7000
        expect(gross.previousValue).toBe(7000);
        // PrevGross(7000) - PrevFix(3000) = 4000
        expect(op.previousValue).toBe(4000);
        // PrevOp(4000) - PrevTax(1200) = 2800
        expect(net.previousValue).toBe(2800);
    });

    it('[Trend Suite] should correctly determine Margins and extract previousValue for trend arrows', async () => {
        const results = await profitKpiProcessor(baseContext);

        const grossMargin = results.find((r) => r.name === 'Margem Bruta (%)')!;
        const opMargin = results.find((r) => r.name === 'Margem Operacional (%)')!;
        const netMargin = results.find((r) => r.name === 'Margem Líquida (%)')!;

        // CURRENT Month (Rev 10000)
        expect(grossMargin.value).toBe(80); // 8000 / 10000 * 100
        expect(opMargin.value).toBe(50);    // 5000 / 10000 * 100
        expect(netMargin.value).toBe(40);   // 4000 / 10000 * 100

        // PREVIOUS Month (Rev 8500)
        // PrevGross 7000 / 8500 = 82.35%
        expect(grossMargin.previousValue).toBeCloseTo(82.35, 2);
        // PrevOp 4000 / 8500 = 47.058%
        expect(opMargin.previousValue).toBeCloseTo(47.06, 2);
        // PrevNet 2800 / 8500 = 32.94%
        expect(netMargin.previousValue).toBeCloseTo(32.94, 2);
    });

    it('[Empty Safety Suite] should protect against Infinity/NaN on empty data sources', async () => {
        const emptyContext = {
            ...baseContext,
            rows: [],
            params: { ...baseContext.params, costSourceTableKey: 'empty-table' },
            fetchByPresetTableKey: async () => ({ rows: [] })
        };

        const results = await profitKpiProcessor(emptyContext);
        
        const grossMargin = results.find((r) => r.name === 'Margem Bruta (%)')!;
        const netMargin = results.find((r) => r.name === 'Margem Líquida (%)')!;
        const profitGrowth = results.find((r) => r.name === 'Crescimento do Lucro (%)')!;

        expect(grossMargin.value).toBe(0); // Protect division by 0
        expect(netMargin.value).toBe(0);
        expect(grossMargin.previousValue).toBeUndefined(); // Should gracefully undefined instead of NaN
        expect(profitGrowth.value).toBe(0);
    });

    it('[Negative Safety] should bypass negative fraud values using DataSanitizer layer', async () => {
        const dirtContext = {
            ...baseContext,
            rows: [
                { id: '1', data: { totalAmount: 'R$ -1000.00', date: '2024-03-01T10:00:00Z', status: 'finalized', paymentStatus: 'paid' } }
            ]
        };
        const results = await profitKpiProcessor(dirtContext);
        const gross = results.find((r) => r.name === 'Lucro Bruto')!;
        // Assuming DataSanitizer.extractCurrency ignores string negative formats or limits exclusions,
        // Wait: row processing actively ignores rowAmount <= 0 via `!Number.isFinite(amount) || amount <= 0` logic.
        // Therefore gross should only deduct the expenses of the month if revenue is blanked.
        const revAmount = 0; 
        const varCosts = 2000;
        expect(gross.value).toBe(-2000); 
    });

});
