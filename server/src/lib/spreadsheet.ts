import ExcelJS from 'exceljs';

/**
 * Minimal tabular (de)serializer for the accounting Data Exchange (BE-INCR-6).
 *
 * One uniform shape for CSV and XLSX so the per-kind validators/exporters never branch
 * on format. XLSX rides on `exceljs` (already a dependency); CSV is a small RFC-4180-core
 * parser/writer — no new dep. All parsed cells are returned as trimmed strings so CSV
 * (untyped) and XLSX (typed) behave identically downstream; money columns are integer
 * cents strings that the validators parse.
 *
 * ponytail: hand-rolled CSV covers quoting/escaping/newlines/BOM — reach for a csv lib
 * only if an RFC-4180 edge case (embedded NUL, exotic delimiters) actually bites.
 */

export type SpreadsheetFormat = 'csv' | 'xlsx';

/** Parsed input table — headers + rows, every cell a trimmed string. */
export interface InTable {
  headers: string[];
  rows: string[][];
}

/** Output cells may be typed (numbers stay numeric in XLSX so Excel treats them as numbers). */
export type OutCell = string | number | null | undefined;
export interface OutTable {
  headers: string[];
  rows: OutCell[][];
}

const BOM = '﻿';

/** RFC-4180-core CSV parse into a matrix of raw string cells (quotes/escapes/newlines handled). */
function parseCsvMatrix(text: string): string[][] {
  if (text.startsWith(BOM)) text = text.slice(1);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } // escaped quote
        else inQuotes = false;
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field); field = '';
    } else if (c === '\n') {
      row.push(field); field = '';
      rows.push(row); row = [];
    } else if (c === '\r') {
      // ignore; the paired \n ends the record
    } else {
      field += c;
    }
  }
  // trailing field/row (file without a final newline)
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** Coerce an exceljs cell value to a plain trimmed string. */
function xlsxCellToString(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    const v = value as { text?: unknown; result?: unknown; richText?: Array<{ text: string }> };
    if (Array.isArray(v.richText)) return v.richText.map((r) => r.text).join('').trim();
    if (v.text !== undefined) return String(v.text).trim();
    if (v.result !== undefined) return String(v.result).trim();
    return '';
  }
  return String(value).trim();
}

/**
 * Parse a CSV/XLSX buffer into `{headers, rows}`. XLSX reads the FIRST worksheet only
 * (D3); the first row is the header. Each row is aligned to the header count (missing
 * cells → '', extra cells dropped). An empty sheet/file yields empty headers + rows.
 */
export async function parseTable(buffer: Buffer, format: SpreadsheetFormat): Promise<InTable> {
  let matrix: string[][];

  if (format === 'csv') {
    matrix = parseCsvMatrix(buffer.toString('utf8'));
  } else {
    const wb = new ExcelJS.Workbook();
    // Node's global Buffer is generic in newer @types/node and doesn't structurally match
    // exceljs's own Buffer param, though they're identical at runtime. Cast through unknown
    // to the exact expected type (no `any`).
    await wb.xlsx.load(buffer as unknown as Parameters<typeof wb.xlsx.load>[0]);
    const ws = wb.worksheets[0];
    matrix = [];
    if (ws) {
      ws.eachRow({ includeEmpty: false }, (excelRow) => {
        const cells: string[] = [];
        // row.values is 1-indexed with a leading undefined; walk columns explicitly.
        const colCount = ws.columnCount;
        for (let col = 1; col <= colCount; col++) {
          cells.push(xlsxCellToString(excelRow.getCell(col).value));
        }
        matrix.push(cells);
      });
    }
  }

  if (matrix.length === 0) return { headers: [], rows: [] };

  const headers = matrix[0].map((h) => h.trim());
  const width = headers.length;
  const rows = matrix.slice(1).map((raw) =>
    Array.from({ length: width }, (_, i) => (raw[i] ?? '').trim()),
  );
  // Drop fully-empty trailing rows (common with spreadsheet exports).
  while (rows.length > 0 && rows[rows.length - 1].every((c) => c === '')) rows.pop();
  return { headers, rows };
}

/**
 * Serialize a table to a CSV or XLSX buffer. CSV gets a UTF-8 BOM so Excel opens accented
 * text correctly (parseTable strips it on the way back in). XLSX writes one worksheet.
 */
export async function serializeTable(table: OutTable, format: SpreadsheetFormat): Promise<Buffer> {
  if (format === 'csv') {
    const esc = (cell: OutCell): string => {
      const s = cell === null || cell === undefined ? '' : String(cell);
      return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [table.headers, ...table.rows].map((r) => r.map(esc).join(','));
    return Buffer.from(BOM + lines.join('\r\n'), 'utf8');
  }

  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Sheet1');
  ws.addRow(table.headers);
  for (const r of table.rows) {
    ws.addRow(r.map((c) => (c === undefined ? null : c)));
  }
  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out);
}
