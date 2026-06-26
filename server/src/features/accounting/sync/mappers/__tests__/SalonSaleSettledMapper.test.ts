import { SalonSaleSettledMapper } from '../SalonSaleSettledMapper';
import { ValidationError } from '../../../../../lib/errors';
import type { AccountingEvent } from '../../AccountingSyncPort';

/**
 * SalonSaleSettledMapper — the money boundary + chart mapping for Incremento D / D1 (settlement).
 * A settlement clears A Receber (credit 1.1.2) and debits the account where the money landed,
 * chosen by paymentMethod. Verifies the per-method debit account (5 cases), gross value,
 * float→cents guards, and that it never collides with the finalized/returned sourceTypes.
 */
function event(over: Partial<AccountingEvent> = {}): AccountingEvent {
  return {
    sourceType: 'salon.sale.settled',
    sourceId: 'sale-1',
    unitId: 'unit-1',
    amount: 250,
    currency: 'BRL',
    occurredAt: '2026-06-25T00:00:00.000Z',
    paymentMethod: 'Cash',
    label: 'Liquidação sale-1',
    ...over,
  };
}

describe('SalonSaleSettledMapper', () => {
  const mapper = new SalonSaleSettledMapper();

  it('declares the salon.sale.settled sourceType', () => {
    expect(mapper.sourceType).toBe('salon.sale.settled');
  });

  // --- D1-QMAP: each paymentMethod → the correct debit account (case by case) ---
  it.each([
    ['Cash', '1.1.3'],
    ['Pix', '1.1.1'],
    ['Debit Card', '1.1.4'],
    ['Credit Card', '1.1.4'],
    ['Package Balance', '2.1.1'],
  ])('maps paymentMethod %s → debit account %s, credit always 1.1.2', (method, debitCode) => {
    const input = mapper.map(event({ paymentMethod: method, amount: 200 }));
    const debit = input.lines.find((l) => l.debitCents > 0)!;
    const credit = input.lines.find((l) => l.creditCents > 0)!;
    expect(debit.accountCode).toBe(debitCode);
    expect(credit.accountCode).toBe('1.1.2'); // A Receber — always the credit leg
    expect(debit.debitCents).toBe(credit.creditCents); // balanced
    expect(debit.creditCents).toBe(0);
    expect(credit.debitCents).toBe(0);
  });

  it('Package Balance NEVER lands in cash/bank — it debits the prepaid liability 2.1.1', () => {
    const input = mapper.map(event({ paymentMethod: 'Package Balance', amount: 200 }));
    const debit = input.lines.find((l) => l.debitCents > 0)!;
    expect(debit.accountCode).toBe('2.1.1');
    expect(input.lines.some((l) => l.accountCode === '1.1.3')).toBe(false); // not Caixa
    expect(input.lines.some((l) => l.accountCode === '1.1.1')).toBe(false); // not Banco
  });

  it('books the GROSS amount (card not netted of fees — fee is Incremento F)', () => {
    const input = mapper.map(event({ paymentMethod: 'Credit Card', amount: 1000 }));
    const debit = input.lines.find((l) => l.debitCents > 0)!;
    expect(debit.debitCents).toBe(100000); // full gross, no fee deduction
  });

  it('converts totalAmount reais (float) to integer cents with Math.round', () => {
    expect(mapper.map(event({ amount: 1500.5 })).lines[0].debitCents).toBe(150050);
    expect(mapper.map(event({ amount: 0.005 })).lines[0].debitCents).toBe(1);
    expect(Number.isInteger(mapper.map(event({ amount: 99.99 })).lines[0].debitCents)).toBe(true);
  });

  it('rejects a missing paymentMethod (no silent default to cash)', () => {
    expect(() => mapper.map(event({ paymentMethod: undefined }))).toThrow(ValidationError);
  });

  it('rejects an unknown paymentMethod (no silent default to cash)', () => {
    expect(() => mapper.map(event({ paymentMethod: 'Bitcoin' }))).toThrow(ValidationError);
  });

  it.each([NaN, Infinity, 0, -10])('rejects invalid amount %s', (amount) => {
    expect(() => mapper.map(event({ amount }))).toThrow(ValidationError);
  });

  it('rejects amounts whose cents fall outside the safe-integer range', () => {
    expect(() => mapper.map(event({ amount: Number.MAX_SAFE_INTEGER }))).toThrow(ValidationError);
  });

  it('uses a DISTINCT sourceType from the finalized revenue entry (no @@unique collision)', () => {
    const input = mapper.map(event());
    expect(input.sourceType).toBe('salon.sale.settled');
    expect(input.sourceType).not.toBe('salon.sale.finalized');
    expect(input.sourceId).toBe('sale-1'); // same saleId, different sourceType → coexist
  });

  it('preserves unitId and uses the event occurredAt (paidAt) as the accounting date', () => {
    const input = mapper.map(event({ unitId: 'unit-9', occurredAt: '2026-03-10T12:00:00.000Z' }));
    expect(input.unitId).toBe('unit-9');
    expect(input.date).toBe('2026-03-10T12:00:00.000Z');
    expect(input.description).toBe('Liquidação salão — Venda sale-1');
  });
});
