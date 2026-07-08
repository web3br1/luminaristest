import { describe, it, expect } from 'vitest';
import { formatDateNumericBR, formatDateBR } from '../formatters';

// The off-by-one assertions below are meaningful under UTC-3 (America/Sao_Paulo),
// where a bare `new Date('2026-07-08')` parses as UTC midnight and renders as
// 07/07/2026. `formatDateNumericBR` parses date-only ISO as LOCAL midnight
// (`+ 'T00:00:00'`), so `08/07/2026` holds regardless of the host timezone —
// that local-parse is exactly what these tests lock in.
describe('formatDateNumericBR', () => {
    it('renders a date-only ISO string as the SAME calendar day (no UTC shift)', () => {
        expect(formatDateNumericBR('2026-07-08')).toBe('08/07/2026'); // NOT '07/07/2026'
    });

    it('renders a Date at local midnight as its calendar day', () => {
        expect(formatDateNumericBR(new Date('2026-07-08T00:00:00'))).toBe('08/07/2026');
    });

    it('renders a real datetime string via the UTC→local path (valid dd/mm/aaaa)', () => {
        expect(formatDateNumericBR('2026-07-08T15:30:00.000Z')).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
    });

    it('returns the em dash for null / undefined / empty', () => {
        expect(formatDateNumericBR(null)).toBe('—');
        expect(formatDateNumericBR(undefined)).toBe('—');
        expect(formatDateNumericBR('')).toBe('—');
    });

    it('falls back to the raw string when unparseable', () => {
        expect(formatDateNumericBR('not-a-date')).toBe('not-a-date');
    });
});

describe('formatDateBR (delegates to the canonical)', () => {
    it('no longer shifts a date-only ISO back a day (regression proof of the delegation fix)', () => {
        expect(formatDateBR('2026-07-08')).toBe('08/07/2026'); // NOT '07/07/2026'
    });

    it('keeps the em dash for null (datetime/empty path unchanged)', () => {
        expect(formatDateBR(null)).toBe('—');
    });
});
