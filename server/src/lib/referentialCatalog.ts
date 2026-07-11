import type { InTable } from './spreadsheet';

/**
 * Pure parser for the RFB referential CATALOG import (BE-INCR-9B / ADR-INCR9B, Track B). No IO:
 * it takes the already-parsed `{headers, rows}` table (from lib/spreadsheet.parseTable — reuse of
 * the INCR-6 infra, decoupled from the physical file format) and maps NAMED columns to catalog
 * rows.
 *
 * IMPORTANT (D1 / I052): this parser INVENTS NOTHING. Every field — including `isAnalytic` — is
 * READ from the file; the analytic indicator is a column, never inferred from a code prefix. The
 * import file is OUR neutral named-column contract (columns: code, name, isAnalytic, [parentCode]);
 * mapping the official RFB layout (its positional columns / encoding / analytic marker — the 9B-1/
 * 9B-4/9B-5 data forks) INTO this contract is the FASE-2 transcription step (B0), done by a human
 * against the official file — not guessed here. `layoutVersion` is NOT a column: it is the
 * import-request parameter (the human declares which layout/year — D7), so the parser is
 * version-agnostic.
 *
 * rowNumber is 1-based over the SOURCE file (header = row 1, first data row = row 2).
 */

/** One parsed catalog row (layoutVersion is stamped by the service, not the file). */
export interface ParsedCatalogRow {
  code: string;
  name: string;
  isAnalytic: boolean;
  parentCode: string | null;
}

/** One row-level problem (bad cell / duplicate code) — reported with the source row number. */
export interface CatalogRowError {
  rowNumber: number;
  field: string;
  message: string;
}

export interface ParsedCatalog {
  rows: ParsedCatalogRow[];
  errors: CatalogRowError[];
}

/** Required import columns; `parentCode` is optional. */
export const REQUIRED_CATALOG_COLS = ['code', 'name', 'isAnalytic'] as const;

/** Thrown when the header row is missing required columns — a whole-file rejection. */
export class CatalogHeaderError extends Error {
  constructor(public readonly missing: string[]) {
    super(`Cabeçalho inválido do catálogo referencial: faltam colunas ${missing.join(', ')}.`);
    this.name = 'CatalogHeaderError';
  }
}

/**
 * Parse an `isAnalytic` cell. Strict boolean tokens only (true/false/1/0) — the mapping of the
 * official layout's analytic marker (9B-4) to this boolean happens in the FASE-2 transcription,
 * so this parser does not guess exotic encodings. Returns null on anything else (→ row error).
 */
function parseAnalytic(raw: string): boolean | null {
  const s = raw.trim().toLowerCase();
  if (s === 'true' || s === '1') return true;
  if (s === 'false' || s === '0') return false;
  return null;
}

function col(headers: string[], name: string): number {
  return headers.indexOf(name);
}

/**
 * Parse the catalog table into rows + per-row errors. Throws CatalogHeaderError if a required
 * column is missing (whole-file reject). A duplicate `code` within the file is a row error (the
 * @@unique would make it an ambiguous last-wins) so the caller can reject the whole import — a
 * partially-imported reference catalog must never exist (it would make destination validation
 * pass/fail arbitrarily).
 */
export function parseReferentialCatalog(table: InTable): ParsedCatalog {
  const { headers, rows } = table;

  const missing = REQUIRED_CATALOG_COLS.filter((c) => !headers.includes(c));
  if (missing.length > 0) throw new CatalogHeaderError(missing);

  const cCode = col(headers, 'code');
  const cName = col(headers, 'name');
  const cAnalytic = col(headers, 'isAnalytic');
  const cParent = col(headers, 'parentCode'); // -1 when absent (optional)

  const out: ParsedCatalogRow[] = [];
  const errors: CatalogRowError[] = [];
  const seen = new Set<string>();

  rows.forEach((row, i) => {
    const rowNumber = i + 2; // header is row 1
    const code = (row[cCode] ?? '').trim();
    const name = (row[cName] ?? '').trim();
    const analyticRaw = row[cAnalytic] ?? '';
    const parentRaw = cParent >= 0 ? (row[cParent] ?? '').trim() : '';

    // Skip a fully-empty row silently (spreadsheet exports leave trailing blanks).
    if (code === '' && name === '' && analyticRaw.trim() === '' && parentRaw === '') return;

    if (code === '') {
      errors.push({ rowNumber, field: 'code', message: 'código referencial vazio' });
      return;
    }
    if (name === '') {
      errors.push({ rowNumber, field: 'name', message: 'nome referencial vazio' });
      return;
    }
    const isAnalytic = parseAnalytic(analyticRaw);
    if (isAnalytic === null) {
      errors.push({
        rowNumber,
        field: 'isAnalytic',
        message: `indicador analítico inválido "${analyticRaw}" (use true/false/1/0)`,
      });
      return;
    }
    if (seen.has(code)) {
      errors.push({ rowNumber, field: 'code', message: `código duplicado no arquivo "${code}"` });
      return;
    }
    seen.add(code);
    out.push({ code, name, isAnalytic, parentCode: parentRaw === '' ? null : parentRaw });
  });

  return { rows: out, errors };
}
