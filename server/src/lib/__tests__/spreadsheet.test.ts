import ExcelJS from 'exceljs';
import { parseTable, serializeTable } from '../spreadsheet';

describe('spreadsheet lib (BE-INCR-6)', () => {
  it('parses CSV with quotes, embedded commas and newlines, and strips BOM', async () => {
    const csv = '﻿code,name,note\r\n1.1,"Banco, Caixa","line1\nline2"\r\n2.1,Capital,\r\n';
    const t = await parseTable(Buffer.from(csv, 'utf8'), 'csv');
    expect(t.headers).toEqual(['code', 'name', 'note']);
    expect(t.rows).toEqual([
      ['1.1', 'Banco, Caixa', 'line1\nline2'],
      ['2.1', 'Capital', ''],
    ]);
  });

  it('aligns short/long rows to the header width', async () => {
    const csv = 'a,b,c\n1\n1,2,3,4\n';
    const t = await parseTable(Buffer.from(csv, 'utf8'), 'csv');
    expect(t.rows).toEqual([['1', '', ''], ['1', '2', '3']]);
  });

  it('round-trips CSV through serialize → parse', async () => {
    const table = {
      headers: ['accountCode', 'debitCents', 'creditCents'],
      rows: [['1.1.01', 100000, 0], ['2.1.01', 0, 100000]],
    };
    const buf = await serializeTable(table, 'csv');
    expect(buf.slice(0, 3).toString('hex')).toBe('efbbbf'); // UTF-8 BOM for Excel
    const back = await parseTable(buf, 'csv');
    expect(back.headers).toEqual(table.headers);
    expect(back.rows).toEqual([['1.1.01', '100000', '0'], ['2.1.01', '0', '100000']]);
  });

  it('round-trips XLSX through serialize → parse (first sheet, cells as strings)', async () => {
    const table = {
      headers: ['code', 'name', 'acceptsEntries'],
      rows: [['1.1.01', 'Banco', 'true'], ['1', 'Ativo', 'false']],
    };
    const buf = await serializeTable(table, 'xlsx');
    const back = await parseTable(buf, 'xlsx');
    expect(back.headers).toEqual(table.headers);
    expect(back.rows).toEqual([['1.1.01', 'Banco', 'true'], ['1', 'Ativo', 'false']]);
  });

  it('returns empty headers/rows for an empty buffer', async () => {
    const t = await parseTable(Buffer.from('', 'utf8'), 'csv');
    expect(t).toEqual({ headers: [], rows: [] });
  });

  describe('CSV formula-injection neutralization (SEC audit)', () => {
    it("prefixes a single quote to cells starting with = + @ or a formula-like -", async () => {
      const table = {
        headers: ['name', 'note'],
        rows: [
          ['=HYPERLINK("http://evil","x")', '@SUM(A1)'],
          ['+1+1', '-2+3'],
        ],
      };
      const csv = (await serializeTable(table, 'csv')).toString('utf8');
      // =, @, +, and the formula-like -2+3 are all defused with a leading ' (quoting aside).
      expect(csv).toContain(`'=HYPERLINK(`);
      expect(csv).toContain(`'@SUM(A1)`);
      expect(csv).toContain(`'+1+1`);
      expect(csv).toContain(`'-2+3`);
    });

    it('leaves plain (including negative) numbers untouched so money stays numeric', async () => {
      const table = { headers: ['debit', 'credit'], rows: [['-100', '250'], ['-100.50', '0']] };
      const csv = (await serializeTable(table, 'csv')).toString('utf8');
      expect(csv).toContain('-100,250');
      expect(csv).toContain('-100.50,0');
      expect(csv).not.toContain("'-100");
    });
  });

  it('rejects an XLSX whose grid exceeds the cell ceiling (zip-bomb guard)', async () => {
    // A single far cell inflates rowCount×columnCount past the 2,000,000 ceiling while the
    // serialized buffer stays tiny (sparse) — exactly the zip-bomb shape, cheaply.
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Sheet1');
    ws.getCell(2001, 1001).value = 'x'; // 2001 × 1001 = 2,003,001 cells > ceiling
    const buf = Buffer.from(await wb.xlsx.writeBuffer());
    await expect(parseTable(buf, 'xlsx')).rejects.toThrow(/too large/i);
  });

  it('accepts a normal XLSX under the cell ceiling', async () => {
    const table = { headers: ['a', 'b'], rows: [['1', '2']] };
    const buf = await serializeTable(table, 'xlsx');
    await expect(parseTable(buf, 'xlsx')).resolves.toBeDefined();
  });
});
