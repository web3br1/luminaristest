import ExcelJS from 'exceljs';

/**
 * Represents a single sheet extracted from an Excel file
 */
export interface ExcelSheet {
  /** Name of the sheet/tab */
  name: string;
  /** Extracted text content from the sheet */
  content: string;
}

/**
 * Extracts text from an Excel file buffer (xlsx or xls)
 * Organizes multi-sheet data in a structured format for AI processing
 * @param buffer The Excel file as ArrayBuffer
 */
export async function extractTextFromExcel(buffer: ArrayBuffer): Promise<string> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  
  const sheets = workbook.worksheets;
  const extractedText: string[] = [];

  // Check if we have multiple sheets
  if (sheets.length > 1) {
    // Multi-sheet format - organize data clearly for AI
    extractedText.push('=== MULTI-SHEET EXCEL FILE ===');
    extractedText.push(`Total sheets: ${sheets.length}`);
    extractedText.push('');

    sheets.forEach((worksheet, index) => {
      const sheetName = worksheet.name;
      const sheetData: string[] = [];
      
      extractedText.push(`=== SHEET ${index + 1}: ${sheetName} ===`);
      
      worksheet.eachRow((row) => {
        const rowText = (row.values as any[])
          .map((cell) => (cell != null ? cell.toString() : ''))
          .join('\t');
        if (rowText.trim() !== '') {
          sheetData.push(rowText);
        }
      });
      
      extractedText.push(sheetData.join('\n'));
      extractedText.push(''); // Empty line between sheets
    });
    
    extractedText.push('=== END OF MULTI-SHEET DATA ===');
  } else {
    // Single sheet format - keep original simple format
    const worksheet = sheets[0];
    worksheet.eachRow((row) => {
      const rowText = (row.values as any[])
        .map((cell) => (cell != null ? cell.toString() : ''))
        .join('\t');
      if (rowText.trim() !== '') {
        extractedText.push(rowText);
      }
    });
  }

  return extractedText.join('\n');
}

/**
 * Extracts each sheet from an Excel file as separate entities
 * @param buffer The Excel file as ArrayBuffer
 * @returns Array of sheets with their names and content
 */
export async function extractSheetsFromExcel(buffer: ArrayBuffer): Promise<ExcelSheet[]> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheets: ExcelSheet[] = [];
  
  workbook.eachSheet((worksheet) => {
    let sheetContent = '';
    worksheet.eachRow((row) => {
      const rowText = (row.values as any[])
        .map((cell) => (cell != null ? cell.toString() : ''))
        .join(' ');
      sheetContent += rowText + '\n';
    });
    
    sheets.push({
      name: worksheet.name,
      content: sheetContent.trim()
    });
  });
  
  return sheets;
}
