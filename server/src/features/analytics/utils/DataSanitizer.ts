export class DataSanitizer {
  /**
   * Safely extracts a numeric float value from a potentially dirty dynamic string.
   * Handles various currency formats: "R$ 1.500,00", "$1,500.50", "1500", "1,500.00".
   */
  static extractCurrency(value: any): number {
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
      // Only comma exists. Check if it's acting as a decimal (e.g. "1500,50") or thousands (e.g. "1,500")
      // Heuristic: If there are exactly 2 digits after the comma, or 1 or 3+, usually 1,500 means 1500, but "15,5" means 15.5
      // Wait, standard assumption: single comma without dots usually acts as a decimal in PT-BR, BUT if it is precisely 3 digits after like 1,000 it might be thousand.
      // Safer fallback for PT-BR / European systems: assume comma is a decimal separator.
      // If it ends with exactly 3 digits e.g. "1,500", some people mean 1500. To be strict, let's treat comma as decimal if it exists.
      str = str.replace(',', '.');
    }
    
    const parsed = Number(str);
    return Number.isFinite(parsed) ? parsed : 0;
  }
}
