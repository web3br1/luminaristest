import { SalonPackageSoldMapper } from '../SalonPackageSoldMapper';
import { ValidationError } from '../../../../../lib/errors';
import type { AccountingEvent } from '../../AccountingSyncPort';

/**
 * SalonPackageSoldMapper — the money boundary + chart mapping for the prepaid-package
 * ORIGIN (Incremento G P4). Selling a package books a LIABILITY, not revenue:
 * D 1.1.2 A Receber / C 2.1.1 Pacotes Pré-pagos.
 */
function event(over: Partial<AccountingEvent> = {}): AccountingEvent {
  return {
    sourceType: 'salon.package.sold',
    sourceId: 'sale-1',
    unitId: 'unit-1',
    amount: 500,
    currency: 'BRL',
    occurredAt: '2026-06-26T00:00:00.000Z',
    label: 'Pacote pré-pago — Venda sale-1',
    ...over,
  };
}

describe('SalonPackageSoldMapper', () => {
  const mapper = new SalonPackageSoldMapper();

  it('declares the salon.package.sold sourceType', () => {
    expect(mapper.sourceType).toBe('salon.package.sold');
  });

  it('converts totalAmount reais (float) to integer cents with Math.round', () => {
    const input = mapper.map(event({ amount: 500.5 }));
    expect(input.lines[0].debitCents).toBe(50050);
    expect(input.lines[1].creditCents).toBe(50050);
    expect(mapper.map(event({ amount: 0.005 })).lines[0].debitCents).toBe(1);
  });

  it('books the liability: D 1.1.2 A Receber / C 2.1.1 Pacotes Pré-pagos (balanced, NOT revenue 3.1)', () => {
    const input = mapper.map(event({ amount: 200 }));
    const debit = input.lines.find((l) => l.debitCents > 0)!;
    const credit = input.lines.find((l) => l.creditCents > 0)!;
    expect(debit.accountCode).toBe('1.1.2');
    expect(credit.accountCode).toBe('2.1.1');
    expect(debit.debitCents).toBe(credit.creditCents); // balanced
    // never touches the revenue account
    expect(input.lines.some((l) => l.accountCode === '3.1')).toBe(false);
  });

  it('preserves sourceType/sourceId/unitId and derives the description', () => {
    const input = mapper.map(event({ sourceId: 'sale-XYZ', unitId: 'unit-9' }));
    expect(input.sourceType).toBe('salon.package.sold');
    expect(input.sourceId).toBe('sale-XYZ');
    expect(input.unitId).toBe('unit-9');
    expect(input.description).toBe('Origem de pacote pré-pago — Venda sale-XYZ');
  });

  it.each([NaN, Infinity, 0, -10, Number.MAX_SAFE_INTEGER])('rejects invalid amount %p', (amount) => {
    expect(() => mapper.map(event({ amount }))).toThrow(ValidationError);
  });

  it('never forwards a float to the posting input (cents are integers)', () => {
    const input = mapper.map(event({ amount: 99.99 }));
    expect(Number.isInteger(input.lines[0].debitCents)).toBe(true);
    expect(input.lines[0].debitCents).toBe(9999);
  });
});
