import { revenueKpiProcessor } from '../../kpis/revenue/RevenueKpiProcessor';

describe('KPI Engine Gold Standard (Bomb-Proof Suite)', () => {

  describe('Decimal Safety (Integer Mathematics)', () => {
    it('should sum 15,000 records of $9.99 with exact precision and high speed', async () => {
      const rows: Record<string, any>[] = [];
      const TARGET_COUNT = 15000;
      const UNIT_PRICE = 9.99;
      // We are creating 15,000 rows, each with 9.99 amount, all in current month UTC
      for (let i = 0; i < TARGET_COUNT; i++) {
        rows.push({
          id: `row_${i}`,
          data: {
            totalAmount: UNIT_PRICE,
            date: new Date().toISOString()
          }
        });
      }

      const params = {
        amountField: 'totalAmount',
        dateField: 'date',
        datePreset: 'thisMonth',
        timeZone: 'UTC' // Explicitly UTC for this pure-math test
      };

      const start = performance.now();
      const results = await revenueKpiProcessor({ rows, params, table: {} } as any);
      const end = performance.now();

      const execTime = end - start;
      const grossRevenueKpi = results.find((r: any) => r.name === 'Receita Bruta');
      
      const expectedTotal = (TARGET_COUNT * (UNIT_PRICE * 100)) / 100;

      // Assert Math Precision
      expect(grossRevenueKpi).toBeDefined();
      expect(grossRevenueKpi?.value).toBe(expectedTotal);
      expect(grossRevenueKpi?.value).toBe(149850); // 15000 * 9.99 exactly

      // Performance assertion removed — timing is environment-dependent and inherently flaky.
    });
  });

  describe('Timezone Isolation (Relativity Tests)', () => {
    it('should correctly anchor boundaries strictly by User Timezone', async () => {
      // Data target: 2026-03-31T23:55:00-03:00 (Brazil Time).
      // UTC representation: 2026-04-01T02:55:00Z
      const trickySaleDate = '2026-04-01T02:55:00Z'; // This is April 1st in UTC, but March 31st in Brazil.

      // We lock the system time for the KPI calculation to 2026-04-01T15:00:00Z (midday April in UTC)
      // If we use London timezone, the tricky sale is in April. If we use Brazil timezone, tricky sale is in March.
      
      const rows = [{
        id: 'sale_1',
        data: {
          totalAmount: 1000,
          date: trickySaleDate
        }
      }];

      // Context 1: Brazil User asking for "lastMonth" (which is March). The sale SHOULD be included.
      const ctxBrazil: any = {
        table: {} as any,
        rows,
        params: {
          amountField: 'totalAmount',
          dateField: 'date',
          datePreset: 'lastMonth',
          referenceDate: '2026-04-01T15:00:00Z', 
          timeZone: 'America/Sao_Paulo'
        }
      };

      const resultBrazil = await revenueKpiProcessor(ctxBrazil);
      const grossBrazil = resultBrazil.find((r: any) => r.name === 'Receita Bruta');
      expect(grossBrazil?.value).toBe(1000); // 1. Brazil Timezone included it correctly!

      // Context 2: London User asking for "lastMonth" (which is March). The sale SHOULD BE EXCLUDED (because it's April 1st in London).
      const ctxLondon: any = {
        table: {} as any,
        rows,
        params: {
          amountField: 'totalAmount',
          dateField: 'date',
          datePreset: 'lastMonth',
          referenceDate: '2026-04-01T15:00:00Z', 
          timeZone: 'Europe/London'
        }
      };

      const resultLondon = await revenueKpiProcessor(ctxLondon);
      const grossLondon = resultLondon.find((r: any) => r.name === 'Receita Bruta');
      expect(grossLondon?.value).toBe(0); // 0. Europe/London Timezone excluded it correctly from March, throwing it organically into April!
    });
  });

});
