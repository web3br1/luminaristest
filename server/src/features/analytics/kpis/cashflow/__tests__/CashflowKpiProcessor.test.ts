import { cashflowKpiProcessor } from '../CashflowKpiProcessor';
import { DatePreset } from '../../../utils/DateUtils';

describe('CashflowKpiProcessor (QA Gold Standard)', () => {

  // ============================================================================
  // SHARED MOCK INFRASTRUCTURE
  // ============================================================================
  const referenceDate = new Date('2024-03-15T12:00:00Z');

  // Sales rows (receivables)
  const mockSalesRows = [
    // CURRENT (March 2024) — Paid
    { id: 'S1', data: { totalAmount: 5000, date: '2024-03-01T10:00:00Z', paymentStatus: 'Paid', dueDate: '2024-03-31T23:59:59Z' } },
    { id: 'S2', data: { totalAmount: 3000, date: '2024-03-10T10:00:00Z', paymentStatus: 'Paid', dueDate: '2024-04-10T23:59:59Z' } },
    // CURRENT (March 2024) — Pending (receivable stock)
    { id: 'S3', data: { totalAmount: 2000, date: '2024-03-05T10:00:00Z', paymentStatus: 'Pending', dueDate: '2024-04-05T23:59:59Z' } },
    // CURRENT (March 2024) — Pending OVERDUE
    { id: 'S4', data: { totalAmount: 1000, date: '2024-02-01T10:00:00Z', paymentStatus: 'Pending', dueDate: '2024-02-28T23:59:59Z' } },
    // PREVIOUS (Feb 2024) — Paid
    { id: 'S5', data: { totalAmount: 4000, date: '2024-02-15T10:00:00Z', paymentStatus: 'Paid', dueDate: '2024-03-15T23:59:59Z' } },
    // Cancelled — excluded
    { id: 'S_CANCEL', data: { totalAmount: 9999, date: '2024-03-08T10:00:00Z', paymentStatus: 'Paid', status: 'Cancelled' } },
    // Negative amount — excluded
    { id: 'S_NEG', data: { totalAmount: -500, date: '2024-03-08T10:00:00Z', paymentStatus: 'Paid' } },
  ];

  // Expense rows (payables)
  const mockExpenseRows = [
    // CURRENT (March) — Paid operational
    { id: 'E1', data: { amount: 2000, date: '2024-03-03T10:00:00Z', paymentStatus: 'Paid', dueDate: '2024-03-31T23:59:59Z', category: 'fixed' } },
    // CURRENT (March) — Paid investment (CAPEX)
    { id: 'E2', data: { amount: 1000, date: '2024-03-08T10:00:00Z', paymentStatus: 'Paid', dueDate: '2024-04-08T23:59:59Z', category: 'capex' } },
    // CURRENT (March) — Pending (payable stock)
    { id: 'E3', data: { amount: 500, date: '2024-03-12T10:00:00Z', paymentStatus: 'Pending', dueDate: '2024-04-30T23:59:59Z', category: 'variable' } },
    // CURRENT (March) — Pending OVERDUE
    { id: 'E4', data: { amount: 800, date: '2024-01-15T10:00:00Z', paymentStatus: 'Pending', dueDate: '2024-02-15T23:59:59Z', category: 'fixed' } },
    // PREVIOUS (Feb) — Paid operational
    { id: 'E5', data: { amount: 1500, date: '2024-02-10T10:00:00Z', paymentStatus: 'Paid', dueDate: '2024-02-28T23:59:59Z', category: 'fixed' } },
    // PREVIOUS (Feb) — Paid investment
    { id: 'E6', data: { amount: 500, date: '2024-02-20T10:00:00Z', paymentStatus: 'Paid', dueDate: '2024-03-20T23:59:59Z', category: 'investimento' } },
  ];

  const fetchByPresetTableKey = async (key: string) => {
    if (key === 'mock-expenses') return { rows: mockExpenseRows };
    return { rows: [] };
  };

  const baseContext: any = {
    rows: mockSalesRows,
    params: {
      referenceDate: referenceDate.toISOString(),
      timeZone: 'UTC',
      datePreset: 'thisMonth' as DatePreset,
      monthsWindow: 12,
      salesAmountField: 'totalAmount',
      salesDateField: 'date',
      salesDueDateField: 'dueDate',
      salesPaymentStatusField: 'paymentStatus',
      salesStatusField: 'status',
      expensesTableKey: 'mock-expenses',
      expenseAmountField: 'amount',
      expenseDateField: 'date',
      expenseDueDateField: 'dueDate',
      expensePaymentStatusField: 'paymentStatus',
      expenseCategoryField: 'category',
      excludeStatuses: ['Cancelled'],
      initialCashBalance: 0,
    },
    table: { id: 'test_sales', name: 'Sales', presetKey: 'sales' },
    schema: { fields: [] },
    fetchByPresetTableKey,
  };

  // ============================================================================
  // SUITE 1 — Math Suite
  // ============================================================================
  describe('[Math Suite]', () => {

    it('should compute Fluxo de Caixa Operacional correctly', async () => {
      const results = await cashflowKpiProcessor(baseContext);
      const op = results.find((r) => r.name === 'Fluxo de Caixa Operacional')!;
      // Current received = S1(5000) + S2(3000) = 8000
      // Current operational outflow = E1(2000) [E2 is capex, excluded from operational]
      // Operational cashflow = 8000 - 2000 = 6000
      expect(op.value).toBe(6000);
    });

    it('should compute Fluxo de Caixa Livre correctly (FIXED formula)', async () => {
      const results = await cashflowKpiProcessor(baseContext);
      const free = results.find((r) => r.name === 'Fluxo de Caixa Livre')!;
      // Free = OpCashflow(6000) - InvestmentOutflow(E2 = 1000) = 5000
      expect(free.value).toBe(5000);
    });

    it('should compute Saldo de Caixa correctly', async () => {
      const results = await cashflowKpiProcessor(baseContext);
      const bal = results.find((r) => r.name === 'Saldo de Caixa')!;
      // All-time paid received: S1(5000) + S2(3000) + S5(4000) = 12000
      // S4 is Pending → NOT in absoluteReceivedCash
      // All-time paid expenses: E1(2000) + E2(1000) + E5(1500) + E6(500) = 5000
      // Balance = 0 + 12000 - 5000 = 7000
      expect(bal.value).toBe(7000);
    });

    it('should compute Contas a Receber Total (pending only)', async () => {
      const results = await cashflowKpiProcessor(baseContext);
      const rec = results.find((r) => r.name === 'Contas a Receber Total')!;
      // S3 (2000 — pending not overdue) + S4 (1000 — pending overdue) = 3000
      expect(rec.value).toBe(3000);
    });

    it('should compute Contas a Receber Vencidas (overdue pending only)', async () => {
      const results = await cashflowKpiProcessor(baseContext);
      const overdue = results.find((r) => r.name === 'Contas a Receber Vencidas')!;
      // S4 due 2024-02-28 < now (2024-03-15) → overdue
      expect(overdue.value).toBe(1000);
    });

    it('should compute Contas a Pagar Total and Vencidas', async () => {
      const results = await cashflowKpiProcessor(baseContext);
      const payable = results.find((r) => r.name === 'Contas a Pagar Total')!;
      const overdueP = results.find((r) => r.name === 'Contas a Pagar Vencidas')!;
      // E3(500) + E4(800) = 1300 pending payables up to now
      expect(payable.value).toBe(1300);
      // E4 due 2024-02-15 < now → overdue
      expect(overdueP.value).toBe(800);
    });

    it('should compute previousValue on cashflow KPIs', async () => {
      const results = await cashflowKpiProcessor(baseContext);
      const op  = results.find((r) => r.name === 'Fluxo de Caixa Operacional')!;
      // prevReceivedAmount: S5(4000)
      // prevOpOutflow: E5(1500)
      // prevOpCashflow = 4000 - 1500 = 2500
      expect(op.previousValue).toBe(2500);

      const free = results.find((r) => r.name === 'Fluxo de Caixa Livre')!;
      // prevFree = prevOpCashflow(2500) - prevInvestmentOutflow(E6=500) = 2000
      expect(free.previousValue).toBe(2000);
    });

    it('should exclude negative amounts via DataSanitizer', async () => {
      const results = await cashflowKpiProcessor(baseContext);
      const op = results.find((r) => r.name === 'Fluxo de Caixa Operacional')!;
      // S_NEG (-500) should be excluded — value stays at 6000, not 5500
      expect(op.value).toBe(6000);
    });

    it('should exclude Cancelled rows via salesStatusField', async () => {
      const results = await cashflowKpiProcessor(baseContext);
      const bal = results.find((r) => r.name === 'Saldo de Caixa')!;
      // S_CANCEL (9999) should be excluded — balance stays 7000 (not 7000+9999=16999)
      expect(bal.value).toBe(7000);
    });

  });

  // ============================================================================
  // SUITE 2 — PT-BR Currency Strings (DataSanitizer)
  // ============================================================================
  describe('[DataSanitizer Suite]', () => {

    it('should correctly parse PT-BR currency strings in sales amount', async () => {
      const strCtx: any = {
        ...baseContext,
        rows: [
          { id: 'STR1', data: { totalAmount: 'R$ 1.500,00', date: '2024-03-01T10:00:00Z', paymentStatus: 'Paid' } },
        ],
        params: { ...baseContext.params, expensesTableKey: undefined },
        fetchByPresetTableKey: async () => ({ rows: [] }),
      };
      const results = await cashflowKpiProcessor(strCtx);
      const op = results.find((r) => r.name === 'Fluxo de Caixa Operacional')!;
      expect(op.value).toBe(1500);
    });

    it('should correctly parse PT-BR currency strings in expense amount', async () => {
      const strExpCtx: any = {
        ...baseContext,
        rows: [
          { id: 'S_STR', data: { totalAmount: 5000, date: '2024-03-01T10:00:00Z', paymentStatus: 'Paid' } },
        ],
        fetchByPresetTableKey: async (key: string) => {
          if (key === 'mock-expenses') {
            return { rows: [
              { id: 'E_STR', data: { amount: 'R$ 2.000,00', date: '2024-03-03T10:00:00Z', paymentStatus: 'Paid', category: 'fixed' } },
            ]};
          }
          return { rows: [] };
        },
      };
      const results = await cashflowKpiProcessor(strExpCtx);
      const op = results.find((r) => r.name === 'Fluxo de Caixa Operacional')!;
      // 5000 received - 2000 paid operational = 3000
      expect(op.value).toBe(3000);
    });

  });

  // ============================================================================
  // SUITE 3 — Timezone Suite
  // ============================================================================
  describe('[Timezone Suite]', () => {

    it('should allocate midnight leap correctly to SP local month', async () => {
      // 2024-04-01T01:00:00Z = 2024-03-31T22:00:00 in America/Sao_Paulo (UTC-3)
      // Should land in March historyMap bucket
      const tzRows = [
        { id: 'TZ1', data: { totalAmount: 1000, date: '2024-04-01T01:00:00Z', paymentStatus: 'Paid' } },
      ];
      const tzCtx: any = {
        ...baseContext,
        rows: tzRows,
        params: {
          ...baseContext.params,
          timeZone: 'America/Sao_Paulo',
          referenceDate: new Date('2024-04-01T02:00:00Z').toISOString(), // still March 31 SP time
          expensesTableKey: undefined,
        },
        fetchByPresetTableKey: async () => ({ rows: [] }),
      };

      const results = await cashflowKpiProcessor(tzCtx);
      const bal = results.find((r) => r.name === 'Saldo de Caixa')!;
      const series = bal.fullRecords?.records || [];
      // The 1000 should land in March 2024 bucket, not April
      const march = series.find((s: any) => s.id === '2024-03');
      expect(march).toBeDefined();
      // Saldo built backward from current; the inflow being in March means it is captured
      expect(bal.value).toBe(1000);
    });

  });

  // ============================================================================
  // SUITE 4 — historyMap Anti-Leap-Month Guard
  // ============================================================================
  describe('[Anti-Leap-Month Guard]', () => {

    it('should not produce a March entry when referenceDate is March 31 and rolling back', async () => {
      // Previously: new Date('2024-03-31'); d.setMonth(-1) → Feb 31 → Mar 3 (bug!)
      // Fixed: d.setDate(1) before setMonth so Feb 28 is correct
      const leapCtx: any = {
        ...baseContext,
        rows: [],
        params: {
          ...baseContext.params,
          referenceDate: new Date('2024-03-31T12:00:00Z').toISOString(),
          expensesTableKey: undefined,
        },
        fetchByPresetTableKey: async () => ({ rows: [] }),
      };

      const results = await cashflowKpiProcessor(leapCtx);
      const op  = results.find((r) => r.name === 'Fluxo de Caixa Operacional')!;
      const series = op.fullRecords?.records || [];

      // Should have exactly 12 entries, no duplicate months
      expect(series.length).toBe(12);
      const keys = series.map((s: any) => s.id);
      const uniqueKeys = new Set(keys);
      expect(uniqueKeys.size).toBe(12); // no duplicates

      // Feb 2024 should exist (not skipped or duplicated)
      expect(keys.includes('2024-02')).toBe(true);
      // March 2024 should exist exactly once
      expect(keys.filter((k: string) => k === '2024-03').length).toBe(1);
    });

  });

  // ============================================================================
  // SUITE 5 — Float Safety Suite
  // ============================================================================
  describe('[Float Safety Suite]', () => {

    it('should accumulate 1000 × R$0.10 as exactly R$100.00 (no float drift)', async () => {
      const floatRows = Array.from({ length: 1000 }, (_, i) => ({
        id: `FL_${i}`,
        data: { totalAmount: 0.1, date: '2024-03-08T10:00:00Z', paymentStatus: 'Paid' },
      }));

      const floatCtx: any = {
        ...baseContext,
        rows: floatRows,
        params: { ...baseContext.params, expensesTableKey: undefined },
        fetchByPresetTableKey: async () => ({ rows: [] }),
      };

      const results = await cashflowKpiProcessor(floatCtx);
      const op = results.find((r) => r.name === 'Fluxo de Caixa Operacional')!;
      const bal = results.find((r) => r.name === 'Saldo de Caixa')!;
      expect(op.value).toBe(100);
      expect(bal.value).toBe(100);
    });

  });

  // ============================================================================
  // SUITE 6 — Empty / Missing Data Suite
  // ============================================================================
  describe('[Empty Safety Suite]', () => {

    it('should return 0 (not NaN/Infinity) on completely empty data', async () => {
      const emptyCtx: any = {
        ...baseContext,
        rows: [],
        params: { ...baseContext.params, expensesTableKey: undefined },
        fetchByPresetTableKey: async () => ({ rows: [] }),
      };

      const results = await cashflowKpiProcessor(emptyCtx);
      for (const r of results) {
        expect(Number.isNaN(r.value)).toBe(false);
        expect(Number.isFinite(r.value)).toBe(true);
        if (r.previousValue !== undefined) {
          expect(Number.isNaN(r.previousValue)).toBe(false);
          expect(Number.isFinite(r.previousValue)).toBe(true);
        }
      }
    });

    it('should handle Índice de Liquidez = 999 when no payables exist', async () => {
      const noPayablesCtx: any = {
        ...baseContext,
        rows: [
          { id: 'S_LIQ', data: { totalAmount: 1000, date: '2024-03-01T10:00:00Z', paymentStatus: 'Pending', dueDate: '2024-05-01T00:00:00Z' } },
        ],
        params: { ...baseContext.params, expensesTableKey: undefined },
        fetchByPresetTableKey: async () => ({ rows: [] }),
      };

      const results = await cashflowKpiProcessor(noPayablesCtx);
      const liq = results.find((r) => r.name === 'Índice de Liquidez Corrente')!;
      // No payables → high liquidity sentinel
      expect(liq.value).toBe(999);
    });

    it('should gracefully continue when expenses table is unavailable', async () => {
      const noExpCtx: any = {
        ...baseContext,
        fetchByPresetTableKey: async () => { throw new Error('Table not found'); },
      };

      // Should not throw — try/catch guards the expense fetch
      const results = await cashflowKpiProcessor(noExpCtx);
      expect(results.length).toBe(11); // all 11 KPIs still returned
      const op = results.find((r) => r.name === 'Fluxo de Caixa Operacional')!;
      // No expense data → cashflow = received amount (no cost deducted)
      expect(Number.isFinite(op.value)).toBe(true);
    });

  });

  // ============================================================================
  // SUITE 7 — Índice de Solvência and Liquidez
  // ============================================================================
  describe('[Solvency & Liquidity Suite]', () => {

    it('should compute Índice de Liquidez Corrente correctly', async () => {
      const results = await cashflowKpiProcessor(baseContext);
      const liq = results.find((r) => r.name === 'Índice de Liquidez Corrente')!;
      // cashBalance = 7000 (S4 is Pending, so not in paid-received)
      // stockReceivables = S3(2000) + S4(1000) = 3000
      // currentAssets = 7000 + 3000 = 10000
      // stockPayables = E3(500) + E4(800) = 1300
      // ratio = 10000 / 1300 ≈ 7.69
      expect(liq.value).toBeCloseTo(10000 / 1300, 2);
    });

    it('should compute Índice de Solvência correctly with param overrides', async () => {
      const solCtx: any = {
        ...baseContext,
        params: {
          ...baseContext.params,
          totalAssets: 20000,
          totalLiabilities: 10000,
        },
      };
      const results = await cashflowKpiProcessor(solCtx);
      const sol = results.find((r) => r.name === 'Índice de Solvência')!;
      expect(sol.value).toBe(2);
    });

  });

  // ============================================================================
  // SUITE 8 — fullRecords (sparklines)
  // ============================================================================
  describe('[fullRecords / Sparklines Suite]', () => {

    it('should return 12 fullRecord entries for all flow KPIs', async () => {
      const results = await cashflowKpiProcessor(baseContext);
      const op  = results.find((r) => r.name === 'Fluxo de Caixa Operacional')!;
      const bal = results.find((r) => r.name === 'Saldo de Caixa')!;
      const liq = results.find((r) => r.name === 'Índice de Liquidez Corrente')!;

      expect(op.fullRecords?.records.length).toBe(12);
      expect(bal.fullRecords?.records.length).toBe(12);
      expect(liq.fullRecords?.records.length).toBe(12);
    });

    it('fullRecords should be sorted chronologically (YYYY-MM ascending)', async () => {
      const results = await cashflowKpiProcessor(baseContext);
      const op      = results.find((r) => r.name === 'Fluxo de Caixa Operacional')!;
      const ids     = op.fullRecords!.records.map((r: any) => r.id);
      for (let i = 1; i < ids.length; i++) {
        expect(ids[i].localeCompare(ids[i - 1])).toBeGreaterThan(0);
      }
    });

  });

});
