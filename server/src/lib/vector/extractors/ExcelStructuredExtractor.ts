import * as ExcelJS from 'exceljs';

// Defines the structure for a single sheet's extracted data.
export interface SheetStructured {
  name: string;
  headers: Array<{ key: string; title: string; type: string }>;
  data: unknown[][];
}

/**
 * Infers the data type of a column based on its values.
 * @param values - An array of values from a single column.
 * @returns The inferred data type ('NUMBER', 'DATE', 'TEXT').
 */
/**
 * Extracts the display value from an ExcelJS cell, handling complex types.
 * @param cell - The cell object from ExcelJS.
 * @returns The displayable value of the cell.
 */
function getCellValue(cell: unknown): unknown {
  if (cell === null || cell === undefined) {
    return null;
  }

  if (typeof cell === 'object') {
    const obj = cell as Record<string, unknown>;
    // Handle formula results
    if (obj.formula && obj.result !== undefined) {
      return obj.result;
    }
    // Handle rich text
    if (obj.richText && Array.isArray(obj.richText)) {
      return (obj.richText as Array<{ text: string }>).map((rt) => rt.text).join('');
    }
    // Handle hyperlinks
    if (obj.hyperlink && obj.text) {
      return obj.text;
    }
  }

  return cell;
}

function slugify(text: string): string {
  if (!text) return '';
  return text
    .toString()
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '_') // Replace spaces with _
    .replace(/[^\w\-]+/g, '') // Remove all non-word chars
    .replace(/__+/g, '_'); // Replace multiple _ with single _
}

function inferType(values: unknown[]): 'NUMBER' | 'DATE' | 'TEXT' {
  const defined = values.filter(v => v !== null && v !== undefined && v !== '');
  if (defined.length === 0) return 'TEXT';

  // Check for numbers (including strings that are valid numbers)
  const areNumbers = defined.every(v => {
    if (typeof v === 'number') return true;
    const str = (v as { toString(): string }).toString().replace(',', '.');
    return !isNaN(Number(str));
  });
  if (areNumbers) return 'NUMBER';

  // Check for dates (including strings that can be parsed as dates)
  const areDates = defined.every(v => {
    if (v instanceof Date) return true;
    return !isNaN(Date.parse((v as { toString(): string }).toString()));
  });
  if (areDates) return 'DATE';

  return 'TEXT';
}

/**
 * Extracts structured data directly from an Excel file buffer.
 * This function bypasses LLM parsing, providing a fast, reliable, and cheap way to handle Excel files.
 * @param fileBuffer - The buffer of the .xlsx file.
 * @returns A promise that resolves to an object containing the structured data for all sheets.
 */
export async function extractStructuredDataFromExcel(
  fileBuffer: Buffer | ArrayBuffer
): Promise<{ sheets: SheetStructured[] }> {
  const workbook = new ExcelJS.Workbook();
  // ExcelJS load() expects the non-generic Buffer type; use Parameters helper to get the exact type
  type XlsxLoadBuffer = Parameters<typeof workbook.xlsx.load>[0];
  const bufferToLoad = (fileBuffer instanceof ArrayBuffer ? Buffer.from(fileBuffer) : fileBuffer) as unknown as XlsxLoadBuffer;
  try {
    await workbook.xlsx.load(bufferToLoad);
  } catch (error) {
    console.error('Erro ao carregar arquivo Excel:', error);
    throw new Error(`Falha ao processar arquivo Excel: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
  }

  const allSheets: SheetStructured[] = [];

  workbook.eachSheet((worksheet, sheetId) => {
    // Get all rows, including empty ones, as an array of arrays.
    // `getSheetValues` is 1-based and can have empty rows at the start.
    const rows = worksheet.getSheetValues() as unknown[][];
    if (!rows || rows.length < 2) {
      return; // Skip empty or header-only sheets
    }

    // Find the first row with content to use as the header row.
    let headerRowIndex = -1;
    for (let i = 1; i < rows.length; i++) {
      if (rows[i] && rows[i].some(cell => cell !== null && cell !== undefined && cell.toString().trim() !== '')) {
        headerRowIndex = i;
        break;
      }
    }

    if (headerRowIndex === -1) {
      return; // No content found
    }

    const headerValues = (rows[headerRowIndex] || []).slice(1); // 1-based, so skip first null element
    const dataRows = rows.slice(headerRowIndex + 1);

    const headers = headerValues.map((titleCell, index: number) => {
      const title = getCellValue(titleCell);
      const headerTitle = title ? title.toString() : `Column ${index + 1}`;
      return {
        key: slugify(headerTitle),
        title: headerTitle,
        type: 'TEXT', // Initial type, will be inferred later
      };
    });

    // Infer the type for each column
    headers.forEach((header, index) => {
      const columnValues = dataRows.map(row => (row ? getCellValue(row[index + 1]) : null));
      header.type = inferType(columnValues);
    });

    const data = dataRows.map(row => {
      if (!row) return headers.map(() => null); // Handle completely empty rows
      const fullRow = row.slice(1).map(getCellValue);
      // Ensure row has the same number of columns as headers, padding with null if necessary
      while (fullRow.length < headers.length) {
        fullRow.push(null);
      }
      return fullRow.slice(0, headers.length);
    });

    allSheets.push({
      name: worksheet.name || `Sheet ${sheetId}`,
      headers,
      data,
    });
  });

  return { sheets: allSheets };
}
