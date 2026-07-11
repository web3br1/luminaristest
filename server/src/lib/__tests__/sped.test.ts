/**
 * SPED ECD serializer primitives (ADR-INCR-SPED-ECD).
 *
 * Pure format-critical logic — the money, date and determinism class-bugs. These
 * tests pin the domain-ratified rules (Manual Leiaute 9 da ECD, ADE Cofis 01/2026):
 *  - cents -> decimal BR by integer divmod: comma, 2 places, NO thousands sep, no float;
 *  - the value field is UNSIGNED magnitude; the sign lives in a separate D/C indicator;
 *  - date YYYY-MM-DD -> DDMMYYYY by literal slice, NO UTC day-shift at year boundary;
 *  - pipe-delimited line starts and ends with `|`; a `|` inside a field is rejected;
 *  - register counting is derived from the actual emitted lines (cannot drift).
 */
import {
  spedLine,
  centsToSpedDecimal,
  dcIndicator,
  spedDate,
  countRegisters,
  __selfCheck,
} from '../sped';

describe('sped serializer primitives', () => {
  describe('centsToSpedDecimal — money, no float, unsigned magnitude', () => {
    it('formats cents as decimal BR with comma and 2 places', () => {
      expect(centsToSpedDecimal(123456)).toBe('1234,56');
      expect(centsToSpedDecimal(100)).toBe('1,00');
      expect(centsToSpedDecimal(5)).toBe('0,05');
      expect(centsToSpedDecimal(0)).toBe('0,00');
    });

    it('emits UNSIGNED magnitude (sign belongs to the D/C indicator)', () => {
      expect(centsToSpedDecimal(-123456)).toBe('1234,56');
      expect(centsToSpedDecimal(-5)).toBe('0,05');
    });

    it('has no thousands separator on large values (float-safe)', () => {
      // A value that (n/100).toFixed(2) could distort; divmod is exact.
      expect(centsToSpedDecimal(214748364799)).toBe('2147483647,99');
    });

    it('rejects non-integer cents (never silently rounds)', () => {
      expect(() => centsToSpedDecimal(10.5)).toThrow();
    });
  });

  describe('dcIndicator — sign as separate D/C column', () => {
    it('debit balance (>=0) is D, credit balance (<0) is C', () => {
      expect(dcIndicator(1)).toBe('D');
      expect(dcIndicator(0)).toBe('D');
      expect(dcIndicator(-1)).toBe('C');
    });
  });

  describe('spedDate — literal slice, no UTC shift', () => {
    it('formats YYYY-MM-DD as DDMMYYYY', () => {
      expect(spedDate('2026-01-31')).toBe('31012026');
    });

    it('does not roll the day back at the year boundary (UTC-shift class bug)', () => {
      // Under a naive new Date('2026-01-01') in America/Sao_Paulo this would be 2025-12-31.
      expect(spedDate('2026-01-01')).toBe('01012026');
    });

    it('rejects a non-calendar date (Feb 30 does not silently roll)', () => {
      expect(() => spedDate('2026-02-30')).toThrow();
      expect(() => spedDate('2026/01/01')).toThrow();
    });
  });

  describe('spedLine — pipe-delimited, starts and ends with pipe', () => {
    it('wraps fields with leading and trailing pipe', () => {
      expect(spedLine(['I150', '01012026', '31012026'])).toBe('|I150|01012026|31012026|');
    });

    it('emits an empty field as empty between pipes', () => {
      expect(spedLine(['I051', '', '1.01.01.00'])).toBe('|I051||1.01.01.00|');
    });

    it('rejects a field containing a pipe (would corrupt the record)', () => {
      expect(() => spedLine(['I050', 'Conta|Ruim'])).toThrow();
    });
  });

  describe('countRegisters — derived from the actual lines', () => {
    it('counts occurrences per register and total lines', () => {
      const lines = ['|0000|x|', '|I150|a|', '|I150|b|', '|I155|c|'];
      const { byRegister, total } = countRegisters(lines);
      expect(byRegister.get('I150')).toBe(2);
      expect(byRegister.get('0000')).toBe(1);
      expect(total).toBe(4);
    });
  });

  it('__selfCheck passes', () => {
    expect(() => __selfCheck()).not.toThrow();
  });
});
