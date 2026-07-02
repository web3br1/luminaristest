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
});
