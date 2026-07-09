import { describe, it, expect } from 'vitest';
import { formatDateBR } from '../formatters';

// Finance `formatDateBR` now delegates to the canonical `formatDateNumericBR`
// (pt-BR, date-only-safe). These lock the fix: a date-only ISO renders the
// correct calendar day (numeric dd/mm/aaaa) instead of shifting back one in
// UTC-3, while the datetime/empty paths stay behavior-preserving.
describe('finance formatDateBR (delegates to the canonical)', () => {
  it('renders a date-only ISO as dd/mm/aaaa without the UTC shift', () => {
    expect(formatDateBR('2026-07-08')).toBe('08/07/2026'); // NOT '07/07/2026'
  });

  it('renders a real datetime string as valid pt-BR dd/mm/aaaa (path unchanged)', () => {
    expect(formatDateBR('2026-07-08T15:30:00.000Z')).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
  });

  it('keeps the em dash for null / undefined', () => {
    expect(formatDateBR(null)).toBe('—');
    expect(formatDateBR(undefined)).toBe('—');
  });
});
