/**
 * Pure RFB referential CATALOG parser (BE-INCR-9B Track B). No IO — takes a parsed InTable and
 * maps named columns to catalog rows. Proves: header rejection, per-row validation (empty
 * code/name, bad isAnalytic token, duplicate code), optional parentCode, and that isAnalytic is
 * READ from the file (never inferred — D1/I052).
 */
import {
  parseReferentialCatalog,
  CatalogHeaderError,
} from '../referentialCatalog';
import type { InTable } from '../spreadsheet';

const table = (headers: string[], rows: string[][]): InTable => ({ headers, rows });

describe('parseReferentialCatalog', () => {
  it('happy path: maps code/name/isAnalytic/parentCode, coercing boolean tokens', () => {
    const t = table(
      ['code', 'name', 'isAnalytic', 'parentCode'],
      [
        ['1', 'Ativo', 'false', ''],
        ['1.01', 'Ativo Circulante', '0', '1'],
        ['1.01.01', 'Caixa', 'true', '1.01'],
        ['1.01.02', 'Bancos', '1', '1.01'],
      ],
    );
    const { rows, errors } = parseReferentialCatalog(t);
    expect(errors).toHaveLength(0);
    expect(rows).toEqual([
      { code: '1', name: 'Ativo', isAnalytic: false, parentCode: null },
      { code: '1.01', name: 'Ativo Circulante', isAnalytic: false, parentCode: '1' },
      { code: '1.01.01', name: 'Caixa', isAnalytic: true, parentCode: '1.01' },
      { code: '1.01.02', name: 'Bancos', isAnalytic: true, parentCode: '1.01' },
    ]);
  });

  it('missing required column → CatalogHeaderError (whole-file reject)', () => {
    expect(() => parseReferentialCatalog(table(['code', 'name'], [['1', 'Ativo']]))).toThrow(
      CatalogHeaderError,
    );
  });

  it('parentCode column is optional (absent → null)', () => {
    const { rows, errors } = parseReferentialCatalog(
      table(['code', 'name', 'isAnalytic'], [['1.01.01', 'Caixa', 'true']]),
    );
    expect(errors).toHaveLength(0);
    expect(rows[0].parentCode).toBeNull();
  });

  it('bad isAnalytic token → row error (not inferred, not defaulted)', () => {
    const { rows, errors } = parseReferentialCatalog(
      table(['code', 'name', 'isAnalytic'], [['1.01.01', 'Caixa', 'sim']]),
    );
    expect(rows).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ rowNumber: 2, field: 'isAnalytic' });
  });

  it('empty code / empty name → row errors', () => {
    const { errors } = parseReferentialCatalog(
      table(
        ['code', 'name', 'isAnalytic'],
        [
          ['', 'Sem código', 'true'],
          ['1.01.01', '', 'true'],
        ],
      ),
    );
    expect(errors.map((e) => e.field).sort()).toEqual(['code', 'name']);
  });

  it('duplicate code within the file → row error (ambiguous last-wins barred)', () => {
    const { rows, errors } = parseReferentialCatalog(
      table(
        ['code', 'name', 'isAnalytic'],
        [
          ['1.01.01', 'Caixa', 'true'],
          ['1.01.01', 'Caixa duplicado', 'true'],
        ],
      ),
    );
    expect(rows).toHaveLength(1);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ rowNumber: 3, field: 'code' });
  });

  it('fully-empty trailing rows are skipped silently', () => {
    const { rows, errors } = parseReferentialCatalog(
      table(['code', 'name', 'isAnalytic', 'parentCode'], [['1.01.01', 'Caixa', 'true', ''], ['', '', '', '']]),
    );
    expect(errors).toHaveLength(0);
    expect(rows).toHaveLength(1);
  });
});
