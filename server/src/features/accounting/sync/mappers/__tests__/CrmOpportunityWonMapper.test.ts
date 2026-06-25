import { CrmOpportunityWonMapper } from '../CrmOpportunityWonMapper';
import { ValidationError } from '../../../../../lib/errors';
import type { AccountingEvent } from '../../AccountingSyncPort';

/**
 * CrmOpportunityWonMapper — the money boundary + chart-of-accounts mapping.
 * Verifies float→cents conversion guards and that the produced legs are balanced
 * against the canonical leaf accounts (1.1.2 / 3.1).
 */
function event(over: Partial<AccountingEvent> = {}): AccountingEvent {
  return {
    sourceType: 'crm.opportunity.won',
    sourceId: 'opp-1',
    unitId: 'unit-1',
    amount: 1500.5,
    currency: 'BRL',
    occurredAt: '2026-06-25T00:00:00.000Z',
    label: 'Deal ACME',
    ...over,
  };
}

describe('CrmOpportunityWonMapper', () => {
  const mapper = new CrmOpportunityWonMapper();

  it('declares the crm.opportunity.won sourceType', () => {
    expect(mapper.sourceType).toBe('crm.opportunity.won');
  });

  it('converts reais (float) to integer cents with Math.round', () => {
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

  it('preserves sourceType, sourceId and the opportunity unitId', () => {
    const input = mapper.map(event({ sourceId: 'opp-XYZ', unitId: 'unit-9' }));
    expect(input.sourceType).toBe('crm.opportunity.won');
    expect(input.sourceId).toBe('opp-XYZ');
    expect(input.unitId).toBe('unit-9');
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
