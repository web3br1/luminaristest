import { describe, it, expect } from 'vitest';
import { formatDate } from '../dates';

// `formatDate` renders in the browser-default locale (NO 'pt-BR' arg), so these
// assertions compare against a locally-computed reference rather than a literal
// string — that keeps them robust across the host locale AND timezone. The bug
// being locked out: a bare `new Date('2026-07-08')` parses as UTC midnight and,
// in UTC-3, `toLocaleDateString()` renders the PREVIOUS day. Parsing as local
// midnight (`+ 'T00:00:00'`) fixes it.
describe('crm formatDate — date-only UTC-shift regression', () => {
  it('renders a date-only ISO as the SAME calendar day (local-midnight reference)', () => {
    const reference = new Date('2026-07-08T00:00:00').toLocaleDateString();
    expect(formatDate('2026-07-08')).toBe(reference);
  });

  it('does NOT shift back to the previous UTC day', () => {
    // The pre-fix bug would have produced the day-07 rendering in UTC-3.
    const shifted = new Date('2026-07-07T00:00:00').toLocaleDateString();
    const correct = new Date('2026-07-08T00:00:00').toLocaleDateString();
    // Guard is only meaningful where the two days format differently (always true).
    expect(correct).not.toBe(shifted);
    expect(formatDate('2026-07-08')).toBe(correct);
  });

  it('leaves the datetime path unchanged (regex does not match → new Date(raw))', () => {
    const iso = '2026-07-08T15:30:00.000Z';
    expect(formatDate(iso)).toBe(new Date(iso).toLocaleDateString());
  });

  it('preserves the em-dash and raw-string fallbacks', () => {
    expect(formatDate(null)).toBe('—');
    expect(formatDate('')).toBe('—');
    expect(formatDate('not-a-date')).toBe('not-a-date');
  });
});
