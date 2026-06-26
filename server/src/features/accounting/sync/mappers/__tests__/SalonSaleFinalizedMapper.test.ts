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
});
