/**
 * Tests for DataSanitizer.extractCurrency — locale-aware number parsing (R13).
 *
 * Verifies that comma-as-thousands-separator inputs are not mis-parsed as
 * decimals (the original bug: "1,500" → 1.5 instead of 1500).
 */
import { DataSanitizer } from '../DataSanitizer';

describe('DataSanitizer.extractCurrency', () => {
  describe('US format — commas as thousands separators', () => {
    it('"1,500" → 1500 (NOT 1.5)', () => {
      expect(DataSanitizer.extractCurrency('1,500')).toBe(1500);
    });

    it('"1,234,567" → 1234567', () => {
      expect(DataSanitizer.extractCurrency('1,234,567')).toBe(1234567);
    });

    it('"1,234.56" → 1234.56', () => {
      expect(DataSanitizer.extractCurrency('1,234.56')).toBe(1234.56);
    });
  });

  describe('PT-BR / EU format — periods as thousands separators, comma as decimal', () => {
    it('"1.234,56" → 1234.56', () => {
      expect(DataSanitizer.extractCurrency('1.234,56')).toBe(1234.56);
    });

    it('"R$ 1.500,00" → 1500', () => {
      expect(DataSanitizer.extractCurrency('R$ 1.500,00')).toBe(1500);
    });
  });

  describe('plain numbers and edge cases', () => {
    it('"0" → 0', () => {
      expect(DataSanitizer.extractCurrency('0')).toBe(0);
    });

    it('numeric 0 → 0', () => {
      expect(DataSanitizer.extractCurrency(0)).toBe(0);
    });

    it('null → 0', () => {
      expect(DataSanitizer.extractCurrency(null)).toBe(0);
    });

    it('undefined → 0', () => {
      expect(DataSanitizer.extractCurrency(undefined)).toBe(0);
    });

    it('"1500" → 1500', () => {
      expect(DataSanitizer.extractCurrency('1500')).toBe(1500);
    });

    it('numeric 42.5 → 42.5', () => {
      expect(DataSanitizer.extractCurrency(42.5)).toBe(42.5);
    });
  });
});
