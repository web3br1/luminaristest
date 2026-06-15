export class DataSanitizer {
  /**
   * Safely extracts a numeric float value from a potentially dirty dynamic string.
   * Handles various currency formats: "R$ 1.500,00", "$1,500.50", "1500", "1,500.00".
   */
  static extractCurrency(value: unknown): number {
    if (value === null || value === undefined) return 0;
    if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
    
    let str = String(value).trim();
    if (!str) return 0;
    
    // Remove totally non-numeric characters EXCEPT digits, dot, comma, and minus
    str = str.replace(/[^\d.,\-]/g, '');
    
    // Determine decimal separator
    const lastCommaIndex = str.lastIndexOf(',');
    const lastDotIndex = str.lastIndexOf('.');
    
    // If both exist, the one appearing last is the decimal separator
    if (lastCommaIndex > -1 && lastDotIndex > -1) {
      if (lastCommaIndex > lastDotIndex) {
        // e.g. "1.500,00" -> remove dots, replace comma with dot
        str = str.replace(/\./g, '').replace(',', '.');
      } else {
        // e.g. "1,500.00" -> remove commas
        str = str.replace(/,/g, '');
      }
    } else if (lastCommaIndex > -1) {
      // Only commas exist, no dots. Determine whether commas are thousands separators or a decimal separator.
      const commaCount = (str.match(/,/g) || []).length;
      const digitsAfterLastComma = str.length - lastCommaIndex - 1;
      if (commaCount > 1) {
        // Multiple commas: must be thousands separators (e.g. "1,234,567") — strip all commas
        str = str.replace(/,/g, '');
      } else if (digitsAfterLastComma === 3) {
        // Single comma with exactly 3 digits after it (e.g. "1,500") — treat as thousands separator
        str = str.replace(/,/g, '');
      } else {
        // Single comma with 1, 2, or 4+ digits after it (e.g. "1,5" or "15,50") — treat as decimal separator
        str = str.replace(',', '.');
      }
    }
    
    const parsed = Number(str);
    return Number.isFinite(parsed) ? parsed : 0;
  }
}
