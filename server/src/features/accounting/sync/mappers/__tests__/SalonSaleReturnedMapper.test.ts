import { SalonSaleReturnedMapper } from '../SalonSaleReturnedMapper';
import { ValidationError } from '../../../../../lib/errors';
import type { AccountingEvent } from '../../AccountingSyncPort';

/**
 * SalonSaleReturnedMapper — the money boundary + chart mapping for Incremento D (devolução).
 * A return books a CONTRA-revenue entry on 3.2 (debit) / 1.1.2 (credit) — distinct from the
 * finalized entry (1.1.2 debit / 3.1 credit), so net revenue is reduced. Verifies float→cents
 * guards and the balanced legs on the canonical leaves.
 */
function event(over: Partial<AccountingEvent> = {}): AccountingEvent {
  return {
    sourceType: 'salon.sale.returned',
    sourceId: 'sale-1',
    unitId: 'unit-1',
    amount: 1500.5,
    currency: 'BRL',
    occurredAt: '2026-06-25T00:00:00.000Z',
    label: 'Devolução sale-1',
    ...over,
  };
}

describe('SalonSaleReturnedMapper', () => {
  const mapper = new SalonSaleReturnedMapper();

  it('declares the salon.sale.returned sourceType', () => {
    expect(mapper.sourceType).toBe('salon.sale.returned');
  });

  it('converts totalAmount reais (float) to integer cents with Math.round', () => {
    const input = mapper.map(event({ amount: 1500.5 }));
    expect(input.lines[0].debitCents).toBe(150050);
    expect(input.lines[1].creditCents).toBe(150050);
    expect(mapper.map(event({ amount: 0.005 })).lines[0].debitCents).toBe(1);
  });

  it('produces BALANCED contra-revenue legs: 3.2 (debit) / 1.1.2 (credit)', () => {
    const input = mapper.map(event({ amount: 200 }));
    const debit = input.lines.find((l) => l.debitCents > 0)!;
    const credit = input.lines.find((l) => l.creditCents > 0)!;
    expect(debit.accountCode).toBe('3.2'); // Devoluções de Vendas (contra-revenue)
    expect(credit.accountCode).toBe('1.1.2'); // A Receber
    expect(debit.debitCents).toBe(credit.creditCents); // balanced
    expect(debit.creditCents).toBe(0);
    expect(credit.debitCents).toBe(0);
  });

  it('does NOT collide with the finalized mapping (different debit account)', () => {
    // The finalized entry debits 1.1.2 / credits 3.1; the return debits 3.2 / credits 1.1.2.
    const input = mapper.map(event());
    expect(input.lines.some((l) => l.accountCode === '3.1')).toBe(false);
  });

  it('preserves sourceType/sourceId/unitId and derives the description from saleId', () => {
    const input = mapper.map(event({ sourceId: 'sale-XYZ', unitId: 'unit-9' }));
    expect(input.sourceType).toBe('salon.sale.returned');
    expect(input.sourceId).toBe('sale-XYZ');
    expect(input.unitId).toBe('unit-9');
    expect(input.description).toBe('Devolução salão — Venda sale-XYZ');
  });

  it('uses the event occurredAt as the accounting date', () => {
    const input = mapper.map(event({ occurredAt: '2026-03-10T12:00:00.000Z' }));
    expect(input.date).toBe('2026-03-10T12:00:00.000Z');
  });

  it.each([NaN, Infinity, 0, -10])('rejects invalid amount %s', (amount) => {
    expect(() => mapper.map(event({ amount }))).toThrow(ValidationError);
  });

  it('rejects amounts whose cents fall outside the safe-integer range', () => {
    expect(() => mapper.map(event({ amount: Number.MAX_SAFE_INTEGER }))).toThrow(ValidationError);
  });

  it('never forwards a float to the posting input (cents are integers)', () => {
    const input = mapper.map(event({ amount: 99.99 }));
    expect(Number.isInteger(input.lines[0].debitCents)).toBe(true);
    expect(input.lines[0].debitCents).toBe(9999);
  });
});
