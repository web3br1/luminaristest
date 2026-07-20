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

  // --- N4 seam fix: revenue split by nature via the CANONICAL splitter (revenueSplit.ts),
  // shared with SalonSaleFinalizedMapper — the CRM credit is no longer split-blind. ---
  describe('revenue split by nature (ADR-INCR-REVENUE-SPLIT / Council N4)', () => {
    it('splits the credit across 3.1 (service) and 3.3 (resale) when the event carries revenueByNature', () => {
      const input = mapper.map(
        event({ amount: 200, revenueByNature: { serviceReais: 100, productReais: 100 } }),
      );
      expect(input.lines).toContainEqual({ accountCode: '3.1', debitCents: 0, creditCents: 10000 });
      expect(input.lines).toContainEqual({ accountCode: '3.3', debitCents: 0, creditCents: 10000 });
      // Balanced: Σcredit === debit total.
      const credit = input.lines.reduce((s, l) => s + l.creditCents, 0);
      expect(credit).toBe(input.lines[0].debitCents);
    });

    it('absorbs the rounding residue in the 3.3 line — Σcredits === total, no cent lost', () => {
      // 1/3 vs 2/3 of 100,01 → serviceCents = round(10001*1/3) = 3334; productCents = 6667.
      const input = mapper.map(
        event({ amount: 100.01, revenueByNature: { serviceReais: 1, productReais: 2 } }),
      );
      const s = input.lines.find((l) => l.accountCode === '3.1')!;
      const p = input.lines.find((l) => l.accountCode === '3.3')!;
      expect(s.creditCents + p.creditCents).toBe(10001);
    });

    it('falls back to a single 3.1 credit without a breakdown (CRM supplies none today — no line items)', () => {
      const input = mapper.map(event({ amount: 200 }));
      expect(input.lines).toHaveLength(2);
      expect(input.lines[1]).toEqual({ accountCode: '3.1', debitCents: 0, creditCents: 20000 });
    });
  });
});
