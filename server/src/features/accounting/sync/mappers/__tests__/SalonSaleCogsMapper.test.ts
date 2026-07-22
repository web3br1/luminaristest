import { SalonSaleCogsMapper } from '../SalonSaleCogsMapper';
import { ValidationError } from '../../../../../lib/errors';
import { MAX_CENTS } from '../../../models/money';
import type { AccountingEvent } from '../../AccountingSyncPort';

/**
 * SalonSaleCogsMapper — the razão leg of a sale's cost-of-goods (INCR-INVENTORY, Body 2). Unlike
 * the revenue mapper it does NOT convert a float: `costCents` arrives ALREADY in integer cents from
 * `InventoryService.recordSaleCogs` (D5/D6). Verifies the Int guards and that the produced legs are
 * balanced on the canonical leaf accounts (4.2 debit / 1.1.6 credit).
 */
function event(over: Partial<AccountingEvent> = {}): AccountingEvent {
  return {
    sourceType: 'salon.sale.cogs',
    sourceId: 'sale-1',
    unitId: 'unit-1',
    amount: 0, // unused for this event kind
    costCents: 12345,
    currency: 'BRL',
    occurredAt: '2026-06-25T00:00:00.000Z',
    label: 'CMV Venda sale-1',
    ...over,
  };
}

describe('SalonSaleCogsMapper', () => {
  const mapper = new SalonSaleCogsMapper();

  it('declares the salon.sale.cogs sourceType', () => {
    expect(mapper.sourceType).toBe('salon.sale.cogs');
  });

  it('produces BALANCED legs on the canonical leaf accounts 4.2 (debit CMV) / 1.1.6 (credit Estoques)', () => {
    const input = mapper.map(event({ costCents: 20000 }));
    const debit = input.lines.find((l) => l.debitCents > 0)!;
    const credit = input.lines.find((l) => l.creditCents > 0)!;
    expect(debit.accountCode).toBe('4.2');
    expect(credit.accountCode).toBe('1.1.6');
    expect(debit.debitCents).toBe(20000);
    expect(credit.creditCents).toBe(20000);
    expect(debit.debitCents).toBe(credit.creditCents); // balanced
    expect(debit.creditCents).toBe(0);
    expect(credit.debitCents).toBe(0);
  });

  it('reads costCents directly (NOT event.amount) — amount is ignored for this event kind', () => {
    // amount deliberately contradicts costCents; the mapper must use costCents.
    const input = mapper.map(event({ amount: 999, costCents: 500 }));
    expect(input.lines[0].debitCents).toBe(500);
    expect(input.lines[1].creditCents).toBe(500);
  });

  it('preserves sourceType, sourceId and the sale unitId, and derives the description from saleId', () => {
    const input = mapper.map(event({ sourceId: 'sale-XYZ', unitId: 'unit-9' }));
    expect(input.sourceType).toBe('salon.sale.cogs');
    expect(input.sourceId).toBe('sale-XYZ');
    expect(input.unitId).toBe('unit-9');
    expect(input.description).toBe('CMV salão — Venda sale-XYZ');
  });

  it('uses the event occurredAt as the accounting date', () => {
    const input = mapper.map(event({ occurredAt: '2026-03-10T12:00:00.000Z' }));
    expect(input.date).toBe('2026-03-10T12:00:00.000Z');
  });

  it('rejects a non-integer (float) costCents', () => {
    expect(() => mapper.map(event({ costCents: 12.5 }))).toThrow(ValidationError);
  });

  it('rejects a missing costCents (undefined)', () => {
    expect(() => mapper.map(event({ costCents: undefined }))).toThrow(ValidationError);
  });

  it('rejects NaN / Infinity', () => {
    expect(() => mapper.map(event({ costCents: NaN }))).toThrow(ValidationError);
    expect(() => mapper.map(event({ costCents: Infinity }))).toThrow(ValidationError);
  });

  it('rejects zero', () => {
    expect(() => mapper.map(event({ costCents: 0 }))).toThrow(ValidationError);
  });

  it('rejects a negative cost', () => {
    expect(() => mapper.map(event({ costCents: -1 }))).toThrow(ValidationError);
  });

  it('rejects a cost above MAX_CENTS (persistence ceiling)', () => {
    expect(() => mapper.map(event({ costCents: MAX_CENTS + 1 }))).toThrow(ValidationError);
  });

  it('accepts exactly MAX_CENTS (boundary)', () => {
    const input = mapper.map(event({ costCents: MAX_CENTS }));
    expect(input.lines[0].debitCents).toBe(MAX_CENTS);
  });
});
