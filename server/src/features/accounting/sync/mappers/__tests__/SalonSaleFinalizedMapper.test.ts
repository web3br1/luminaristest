import { SalonSaleFinalizedMapper } from '../SalonSaleFinalizedMapper';
import { ValidationError } from '../../../../../lib/errors';
import type { AccountingEvent } from '../../AccountingSyncPort';

/**
 * SalonSaleFinalizedMapper — the money boundary + chart-of-accounts mapping for
 * Incremento C. Verifies float→cents conversion guards and that the produced legs are
 * balanced against the canonical leaf accounts (1.1.2 debit / 3.1 credit) — the same
 * accounts as CRM revenue recognition, by ADR-C01.
 */
function event(over: Partial<AccountingEvent> = {}): AccountingEvent {
  return {
    sourceType: 'salon.sale.finalized',
    sourceId: 'sale-1',
    unitId: 'unit-1',
    amount: 1500.5,
    currency: 'BRL',
    occurredAt: '2026-06-25T00:00:00.000Z',
    label: 'Venda sale-1',
    ...over,
  };
}

describe('SalonSaleFinalizedMapper', () => {
  const mapper = new SalonSaleFinalizedMapper();

  it('declares the salon.sale.finalized sourceType', () => {
    expect(mapper.sourceType).toBe('salon.sale.finalized');
  });

  it('converts totalAmount reais (float) to integer cents with Math.round', () => {
    const input = mapper.map(event({ amount: 1500.5 }));
    expect(input.lines[0].debitCents).toBe(150050);
    expect(input.lines[1].creditCents).toBe(150050);
    // round half-up at the boundary
    expect(mapper.map(event({ amount: 0.005 })).lines[0].debitCents).toBe(1);
  });

  it('produces BALANCED legs on the canonical leaf accounts 1.1.2 (debit) / 3.1 (credit)', () => {
    const input = mapper.map(event({ amount: 200 }));
    const debit = input.lines.find((l) => l.debitCents > 0)!;
    const credit = input.lines.find((l) => l.creditCents > 0)!;
    expect(debit.accountCode).toBe('1.1.2');
    expect(credit.accountCode).toBe('3.1');
    expect(debit.debitCents).toBe(credit.creditCents); // balanced
    expect(debit.creditCents).toBe(0);
    expect(credit.debitCents).toBe(0);
  });

  it('preserves sourceType, sourceId and the sale unitId, and derives the description from saleId', () => {
    const input = mapper.map(event({ sourceId: 'sale-XYZ', unitId: 'unit-9' }));
    expect(input.sourceType).toBe('salon.sale.finalized');
    expect(input.sourceId).toBe('sale-XYZ');
    expect(input.unitId).toBe('unit-9');
    expect(input.description).toBe('Receita salão — Venda sale-XYZ');
  });

  it('uses the event occurredAt as the accounting date', () => {
    const input = mapper.map(event({ occurredAt: '2026-03-10T12:00:00.000Z' }));
    expect(input.date).toBe('2026-03-10T12:00:00.000Z');
  });

  it('rejects NaN', () => {
    expect(() => mapper.map(event({ amount: NaN }))).toThrow(ValidationError);
  });

  it('rejects Infinity', () => {
    expect(() => mapper.map(event({ amount: Infinity }))).toThrow(ValidationError);
  });

  it('rejects zero', () => {
    expect(() => mapper.map(event({ amount: 0 }))).toThrow(ValidationError);
  });

  it('rejects negative values', () => {
    expect(() => mapper.map(event({ amount: -10 }))).toThrow(ValidationError);
  });

  it('rejects amounts whose cents fall outside the safe-integer range', () => {
    expect(() => mapper.map(event({ amount: Number.MAX_SAFE_INTEGER }))).toThrow(ValidationError);
  });

  it('never forwards a float to the posting input (cents are integers)', () => {
    const input = mapper.map(event({ amount: 99.99 }));
    expect(Number.isInteger(input.lines[0].debitCents)).toBe(true);
    expect(Number.isInteger(input.lines[1].creditCents)).toBe(true);
    expect(input.lines[0].debitCents).toBe(9999);
  });

  // --- Revenue split by nature (ADR-INCR-REVENUE-SPLIT) ---
  describe('revenue split by nature', () => {
    /** Sum the credit legs (revenue) of a mapped entry, in cents. */
    const sumCredits = (input: ReturnType<typeof mapper.map>) =>
      input.lines.reduce((s, l) => s + l.creditCents, 0);
    const creditOn = (input: ReturnType<typeof mapper.map>, code: string) =>
      input.lines.find((l) => l.accountCode === code && l.creditCents > 0)?.creditCents ?? 0;

    it('with NO breakdown falls back to a single 3.1 (Serviços) credit (backwards-compatible)', () => {
      const input = mapper.map(event({ amount: 200 }));
      expect(input.lines).toHaveLength(2); // debit 1.1.2 + single credit
      expect(creditOn(input, '3.1')).toBe(20000);
      expect(creditOn(input, '3.3')).toBe(0);
    });

    it('splits a MIXED sale into 3.1 (serviço) + 3.3 (revenda) whose sum equals the total', () => {
      const input = mapper.map(
        event({ amount: 200, revenueByNature: { serviceReais: 100, productReais: 100 } }),
      );
      const debit = input.lines.find((l) => l.debitCents > 0)!;
      expect(debit.accountCode).toBe('1.1.2');
      expect(debit.debitCents).toBe(20000);
      expect(creditOn(input, '3.1')).toBe(10000);
      expect(creditOn(input, '3.3')).toBe(10000);
      // NO cent lost + balanced
      expect(sumCredits(input)).toBe(20000);
      expect(sumCredits(input)).toBe(debit.debitCents);
    });

    it('rateia a HEADER discount proportionally (item subtotals ≠ booked total)', () => {
      // items sum to 200 (100 service / 100 product) but the sale total is 180 (R$20 header discount)
      const input = mapper.map(
        event({ amount: 180, revenueByNature: { serviceReais: 100, productReais: 100 } }),
      );
      expect(creditOn(input, '3.1')).toBe(9000); // discount split evenly
      expect(creditOn(input, '3.3')).toBe(9000);
      expect(sumCredits(input)).toBe(18000); // == totalCents, discount absorbed proportionally
    });

    it('absorbs the rounding residue on the product line, still summing to the total', () => {
      // 1:2 proportion over 10001 cents does not divide evenly
      const input = mapper.map(
        event({ amount: 100.01, revenueByNature: { serviceReais: 1, productReais: 2 } }),
      );
      expect(creditOn(input, '3.1')).toBe(3334); // round(10001 * 1/3)
      expect(creditOn(input, '3.3')).toBe(6667); // 10001 - 3334 (residue here)
      expect(sumCredits(input)).toBe(10001);
    });

    it('routes a SERVICE-only sale to a single 3.1 credit (no zero 3.3 line)', () => {
      const input = mapper.map(
        event({ amount: 150, revenueByNature: { serviceReais: 150, productReais: 0 } }),
      );
      expect(creditOn(input, '3.1')).toBe(15000);
      expect(input.lines.some((l) => l.accountCode === '3.3')).toBe(false);
      expect(sumCredits(input)).toBe(15000);
    });

    it('routes a PRODUCT-only sale to a single 3.3 credit (no zero 3.1 line)', () => {
      const input = mapper.map(
        event({ amount: 150, revenueByNature: { serviceReais: 0, productReais: 150 } }),
      );
      expect(creditOn(input, '3.3')).toBe(15000);
      expect(input.lines.some((l) => l.accountCode === '3.1')).toBe(false);
      expect(sumCredits(input)).toBe(15000);
    });

    it('preserves the idempotency axes (sourceType, sourceId) regardless of the split', () => {
      const input = mapper.map(
        event({ sourceId: 'sale-Z', revenueByNature: { serviceReais: 10, productReais: 90 } }),
      );
      expect(input.sourceType).toBe('salon.sale.finalized');
      expect(input.sourceId).toBe('sale-Z');
    });
  });
});
