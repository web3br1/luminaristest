import { salesProfitByProductOverTimeProcessor } from '../SalesProfitByProductProcessor';

describe('SalesProfitByProductProcessor (QA Gold Standard)', () => {

  // ============================================================================
  // SHARED MOCK INFRASTRUCTURE
  // ============================================================================
  const referenceDate = new Date('2024-03-15T12:00:00Z');

  // Minimal stock movements: product P1 has avg cost R$10/unit (100 total / 10 qty)
  const mockStockMovements = [
    { id: 'SM1', data: { type: 'In', productId: 'P1', quantity: 10, cost: 100 } }, // avg = R$10
    { id: 'SM2', data: { type: 'In', productId: 'P1', quantity: 10, cost: 200 } }, // avg = R$15 (weighted)
    { id: 'SM3', data: { type: 'In', productId: 'P2', quantity:  5, cost:  50 } }, // avg = R$10
    { id: 'SM4', data: { type: 'Out', productId: 'P1', quantity: 2, cost: 0 } },   // Out → ignored
  ];
  // P1 weighted avg: (100 + 200) / (10 + 10) = R$15
  // P2 weighted avg: 50 / 5 = R$10

  const mockHeaders = [
    { id: 'SALE1', data: { date: '2024-03-05T10:00:00Z', paymentStatus: 'Paid' } },   // Current
    { id: 'SALE2', data: { date: '2024-02-10T10:00:00Z', paymentStatus: 'Paid' } },   // Prev
    { id: 'SALE3', data: { date: '2024-03-10T10:00:00Z', paymentStatus: 'Pending' } }, // Excluded
    { id: 'OLD',   data: { date: '2022-01-01T10:00:00Z', paymentStatus: 'Paid' } },    // Outside window
  ];

  const mockSaleItems = [
    // SALE1 (March — Paid): P1, qty=2, price=R$50 → revenue=100, cost=15×2=30, profit=70
    { id: 'I1', data: { itemType: 'Product', saleId: 'SALE1', productId: 'P1', quantity: 2, unitPrice: 50 } },
    // SALE1 (March — Paid): P2, qty=3, price=R$20 → revenue=60, cost=10×3=30, profit=30
    { id: 'I2', data: { itemType: 'Product', saleId: 'SALE1', productId: 'P2', quantity: 3, unitPrice: 20 } },
    // SALE2 (Feb — Paid): P1, qty=1, price=R$50 → revenue=50, cost=15×1=15, profit=35
    { id: 'I3', data: { itemType: 'Product', saleId: 'SALE2', productId: 'P1', quantity: 1, unitPrice: 50 } },
    // SALE3 (March — Pending): excluded by payment status
    { id: 'I4', data: { itemType: 'Product', saleId: 'SALE3', productId: 'P1', quantity: 10, unitPrice: 50 } },
    // OLD: outside 12-month window
    { id: 'I5', data: { itemType: 'Product', saleId: 'OLD',   productId: 'P1', quantity: 10, unitPrice: 50 } },
    // Service item — should be skipped
    { id: 'I6', data: { itemType: 'Service', saleId: 'SALE1', productId: 'SV1', quantity: 1, unitPrice: 100 } },
  ];

  const fetchByPresetTableKey = async (key: string) => {
    if (key === 'mock-headers')   return { rows: mockHeaders };
    if (key === 'mock-stock')     return { rows: mockStockMovements };
    return { rows: [] };
  };

  const baseContext: any = {
    rows: mockSaleItems,
    params: {
      referenceDate: referenceDate.toISOString(),
      timeZone: 'UTC',
      period: 'month',
      monthsWindow: 12,
      headerTableKey: 'mock-headers',
      stockMovementsTableKey: 'mock-stock',
      stockCostIsTotal: true,
      includePaymentStatuses: ['Paid'],
    },
    table: { id: 'test_sale_items', name: 'Sale Items' },
    schema: { fields: [] },
    fetchByPresetTableKey,
  };

  // ============================================================================
  // SUITE 1 — Math Suite
  // ============================================================================
  describe('[Math Suite]', () => {

    it('should compute weighted avg cost and profit correctly per period', async () => {
      const results = await salesProfitByProductOverTimeProcessor(baseContext);

      // March 2024: I1 (70) + I2 (30) = 100
      const march = results.find((r) => r.name === '2024-03')!;
      expect(march).toBeDefined();
      expect(march.value).toBe(100);

      // Feb 2024: I3 (35)
      const feb = results.find((r) => r.name === '2024-02')!;
      expect(feb).toBeDefined();
      expect(feb.value).toBe(35);
    });

    it('should skip Service items and excluded payment statuses', async () => {
      const results = await salesProfitByProductOverTimeProcessor(baseContext);

      const march = results.find((r) => r.name === '2024-03')!;
      // I4 (Pending) and I6 (Service) should NOT contribute
      // If they did, march would be 100 + (10×50-15×10=350) + 100 = 550
      expect(march.value).toBe(100);
    });

    it('should handle PT-BR currency strings in quantity and unitPrice via DataSanitizer', async () => {
      const stringCtx: any = {
        ...baseContext,
        rows: [
          { id: 'STR1', data: { itemType: 'Product', saleId: 'SALE1', productId: 'P2', quantity: 'R$ 2,00', unitPrice: 'R$ 30,00' } },
        ],
      };
      // P2 avg cost = 10, qty=2, price=30 → revenue=60, cost=20, profit=40
      const results = await salesProfitByProductOverTimeProcessor(stringCtx);
      const march = results.find((r) => r.name === '2024-03')!;
      expect(march.value).toBe(40);
    });

    it('should use zero cost when product has no stock movement data', async () => {
      const unknownProductCtx: any = {
        ...baseContext,
        rows: [
          { id: 'U1', data: { itemType: 'Product', saleId: 'SALE1', productId: 'UNKNOWN', quantity: 5, unitPrice: 20 } },
        ],
      };
      // cost = 0, profit = 5 × 20 = 100
      const results = await unknownProductCtx ? await salesProfitByProductOverTimeProcessor(unknownProductCtx) : [];
      const march = results.find((r) => r.name === '2024-03')!;
      expect(march.value).toBe(100);
    });

  });

  // ============================================================================
  // SUITE 2 — Timezone Suite
  // ============================================================================
  describe('[Timezone Suite]', () => {

    it('should allocate midnight leap correctly to SP local month', async () => {
      // 2024-04-01T01:00:00Z = 2024-03-31T22:00:00 in America/Sao_Paulo (UTC-3)
      // Should land in March 2024, not April 2024
      const tzHeaders = [
        { id: 'TZ_SALE', data: { date: '2024-04-01T01:00:00Z', paymentStatus: 'Paid' } },
      ];
      const tzRows = [
        { id: 'TZ1', data: { itemType: 'Product', saleId: 'TZ_SALE', productId: 'P2', quantity: 1, unitPrice: 100 } },
      ];
      const tzCtx: any = {
        ...baseContext,
        rows: tzRows,
        params: {
          ...baseContext.params,
          timeZone: 'America/Sao_Paulo',
          referenceDate: new Date('2024-04-01T01:30:00Z').toISOString(), // Still in March in SP
        },
        fetchByPresetTableKey: async (key: string) => {
          if (key === 'mock-headers') return { rows: tzHeaders };
          if (key === 'mock-stock')   return { rows: mockStockMovements };
          return { rows: [] };
        },
      };

      const results = await salesProfitByProductOverTimeProcessor(tzCtx);
      // P2 cost=10, qty=1, price=100 → profit=90
      const march = results.find((r) => r.name === '2024-03')!;
      const april = results.find((r) => r.name === '2024-04');
      expect(march?.value).toBe(90);
      expect(april?.value ?? 0).toBe(0); // April should be zero (or not exist in window)
    });

  });

  // ============================================================================
  // SUITE 3 — Missing Data Suite
  // ============================================================================
  describe('[Missing Data Suite]', () => {

    it('should fallback to saleItemDateField when headerTableKey is absent', async () => {
      const noHeaderCtx: any = {
        ...baseContext,
        rows: [
          // Date directly on the row
          { id: 'NH1', data: { itemType: 'Product', productId: 'P2', quantity: 2, unitPrice: 20, date: '2024-03-08T10:00:00Z' } },
        ],
        params: {
          ...baseContext.params,
          headerTableKey: undefined, // no header table
          saleItemDateField: 'date',
        },
        fetchByPresetTableKey: async (key: string) => {
          if (key === 'mock-stock') return { rows: mockStockMovements };
          throw new Error(`Unexpected table key: ${key}`);
        },
      };

      const results = await salesProfitByProductOverTimeProcessor(noHeaderCtx);
      // P2 avg=10, qty=2, price=20 → profit=20
      const march = results.find((r) => r.name === '2024-03')!;
      expect(march.value).toBe(20);
    });

    it('should treat profit as gross revenue when stockMovementsTableKey is absent', async () => {
      const noStockCtx: any = {
        ...baseContext,
        params: {
          ...baseContext.params,
          stockMovementsTableKey: undefined,
        },
        fetchByPresetTableKey: async (key: string) => {
          if (key === 'mock-headers') return { rows: mockHeaders };
          return { rows: [] };
        },
      };

      const results = await salesProfitByProductOverTimeProcessor(noStockCtx);
      // No cost data → cost = 0 → profit = revenue
      // I1: 2×50=100, I2: 3×20=60 → March total = 160
      const march = results.find((r) => r.name === '2024-03')!;
      expect(march.value).toBe(160);
    });

    it('should skip rows with qty <= 0 or invalid numbers', async () => {
      const dirtyCtx: any = {
        ...baseContext,
        rows: [
          { id: 'D1', data: { itemType: 'Product', saleId: 'SALE1', productId: 'P1', quantity: -5,  unitPrice: 50 } }, // negative qty
          { id: 'D2', data: { itemType: 'Product', saleId: 'SALE1', productId: 'P1', quantity: 0,   unitPrice: 50 } }, // zero qty
          { id: 'D3', data: { itemType: 'Product', saleId: 'SALE1', productId: 'P1', quantity: NaN, unitPrice: 50 } }, // NaN
          { id: 'D4', data: { itemType: 'Product', saleId: 'SALE1', productId: 'P1', quantity: 2,   unitPrice: 50 } }, // valid → 2×50-15×2=70
        ],
      };

      const results = await salesProfitByProductOverTimeProcessor(dirtyCtx);
      const march = results.find((r) => r.name === '2024-03')!;
      expect(march.value).toBe(70); // Only D4 contributed
    });

    it('should return zero-filled series on completely empty data', async () => {
      const emptyCtx: any = {
        ...baseContext,
        rows: [],
      };

      const results = await salesProfitByProductOverTimeProcessor(emptyCtx);
      expect(results.length).toBe(12); // 12 months always present
      results.forEach((r) => {
        expect(r.value).toBe(0);
        expect(Number.isNaN(r.value)).toBe(false);
      });
    });

  });

  // ============================================================================
  // SUITE 4 — Windowing Suite
  // ============================================================================
  describe('[Windowing Suite]', () => {

    it('should always return exactly N entries corresponding to monthsWindow', async () => {
      const ctx6: any = { ...baseContext, params: { ...baseContext.params, monthsWindow: 6 } };
      const results = await salesProfitByProductOverTimeProcessor(ctx6);
      expect(results.length).toBe(6);
    });

    it('should exclude records outside the rolling window', async () => {
      const results = await salesProfitByProductOverTimeProcessor(baseContext);
      // OLD sale (2022-01) should not appear at all
      const old = results.find((r) => r.name === '2022-01');
      expect(old).toBeUndefined();
    });

    it('should return sorted ascending YYYY-MM series', async () => {
      const results = await salesProfitByProductOverTimeProcessor(baseContext);
      for (let i = 1; i < results.length; i++) {
        expect(results[i].name.localeCompare(results[i - 1].name)).toBeGreaterThan(0);
      }
    });

    it('should provide previousValue equal to prior period value', async () => {
      const results = await salesProfitByProductOverTimeProcessor(baseContext);
      // The last entry (March 2024) should have previousValue = Feb 2024's value
      const feb   = results.find((r) => r.name === '2024-02')!;
      const march = results.find((r) => r.name === '2024-03')!;
      expect(march.previousValue).toBe(feb.value);
    });

  });

  // ============================================================================
  // SUITE 5 — Float Safety Suite
  // ============================================================================
  describe('[Float Safety Suite]', () => {

    it('should accumulate 1000 × R$0.10 as exactly R$100.00 (no float drift)', async () => {
      // Build 1000 identical items in March 2024, each contributing R$0.10 profit
      // price = 0.20, cost = 0.10 (product with known avg cost) → profit/item = 0.10
      const driftRows = Array.from({ length: 1000 }, (_, i) => ({
        id: `DRIFT_${i}`,
        data: { itemType: 'Product', saleId: 'SALE1', productId: 'P_DRIFT', quantity: 1, unitPrice: 0.2 },
      }));

      const driftStock = [
        { id: 'DS1', data: { type: 'In', productId: 'P_DRIFT', quantity: 1000, cost: 100 } }, // avg = 0.10/unit
      ];

      const driftCtx: any = {
        ...baseContext,
        rows: driftRows,
        fetchByPresetTableKey: async (key: string) => {
          if (key === 'mock-headers') return { rows: mockHeaders };
          if (key === 'mock-stock')   return { rows: driftStock };
          return { rows: [] };
        },
      };

      const results = await salesProfitByProductOverTimeProcessor(driftCtx);
      const march = results.find((r) => r.name === '2024-03')!;
      // Expected: 1000 × (0.20 - 0.10) = 100.00 exactly
      expect(march.value).toBe(100);
    });

  });

});
