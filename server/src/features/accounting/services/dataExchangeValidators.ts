import type { InTable } from '../../../lib/spreadsheet';
import type { ImportKind, ValidatedRow } from '../models/DataExchange.model';
import { MAX_CENTS } from '../models/money';
import { isValidDateOnly } from '../models/dates';

/**
 * Pure per-kind validators for the accounting Data Exchange import (BE-INCR-6). No IO —
 * they take the parsed table + a snapshot of existing accounts and return one ValidatedRow
 * per source row (VALID/INVALID). The commit step re-checks authoritative invariants
 * (period gate, balance) inside PostingService; these validators give fast preview feedback.
 *
 * rowNumber is 1-based over the SOURCE file (header = row 1, first data row = row 2) so the
 * error report lines up with what the user sees in the spreadsheet.
 */

export interface AccountLike {
  code: string;
  acceptsEntries: boolean;
}

const NATURES = new Set(['Asset', 'Liability', 'Equity', 'Revenue', 'Expense']);
// isValidDateOnly (models/dates.ts) = regex + calendar round-trip — a regex alone lets
// '2026-02-30' import and silently shift to 03-02 downstream (class-fix).

// MAX_CENTS (Int32 storage ceiling) is shared with the direct /post DTO — see models/money.ts.
// Guarding here makes the import preview reject an over-ceiling value with a clear message
// instead of a late opaque POST_FAILED at commit (ACC-INCR6-J-001).

const CHART_COLS = ['code', 'name', 'nature', 'acceptsEntries', 'parentCode'];
const OPENING_COLS = ['accountCode', 'postingDate', 'description', 'debitCents', 'creditCents'];
const JOURNAL_COLS = [
  'entryKey', 'documentDate', 'postingDate', 'description',
  'accountCode', 'debitCents', 'creditCents', 'lineDescription', 'externalReference',
];

const REQUIRED: Record<ImportKind, string[]> = {
  IMPORT_CHART_OF_ACCOUNTS: ['code', 'name', 'nature'],
  IMPORT_OPENING_BALANCES: ['accountCode', 'postingDate', 'debitCents', 'creditCents'],
  IMPORT_JOURNAL_ENTRIES: ['entryKey', 'postingDate', 'accountCode', 'debitCents', 'creditCents'],
};

const COLS: Record<ImportKind, string[]> = {
  IMPORT_CHART_OF_ACCOUNTS: CHART_COLS,
  IMPORT_OPENING_BALANCES: OPENING_COLS,
  IMPORT_JOURNAL_ENTRIES: JOURNAL_COLS,
};

/** Thrown when the header row is missing required columns — a whole-file rejection. */
export class ImportHeaderError extends Error {
  constructor(public readonly missing: string[]) {
    super(`Cabeçalho inválido: faltam colunas ${missing.join(', ')}.`);
    this.name = 'ImportHeaderError';
  }
}

/** Parse a cents cell: must be a non-negative integer string. */
function parseCents(raw: string): number | null {
  if (!/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) ? n : null;
}

/** Parse an acceptsEntries cell (true/false/1/0/empty→true). Returns null on garbage. */
function parseBool(raw: string): boolean | null {
  const s = raw.trim().toLowerCase();
  if (s === '' || s === 'true' || s === '1') return true;
  if (s === 'false' || s === '0') return false;
  return null;
}

function rowObject(headers: string[], row: string[]): Record<string, string> {
  return Object.fromEntries(headers.map((h, i) => [h, row[i] ?? '']));
}

/** Column index or -1. */
function col(headers: string[], name: string): number {
  return headers.indexOf(name);
}

function invalid(rowNumber: number, rawJson: string, code: string, message: string, field?: string, groupKey?: string): ValidatedRow {
  return { rowNumber, rawJson, status: 'INVALID', errorCode: code, errorMessage: message, field: field ?? null, groupKey: groupKey ?? null, normalizedJson: null };
}

// ─── Chart of accounts ──────────────────────────────────────────────────────

function validateChart(table: InTable, existingCodes: Set<string>): ValidatedRow[] {
  const { headers, rows } = table;
  const cCode = col(headers, 'code');
  const cName = col(headers, 'name');
  const cNature = col(headers, 'nature');
  const cAccepts = col(headers, 'acceptsEntries');
  const cParent = col(headers, 'parentCode');

  const fileCodes = new Set(rows.map((r) => (r[cCode] ?? '').trim()).filter(Boolean));
  const seen = new Set<string>();

  return rows.map((row, i) => {
    const rowNumber = i + 2;
    const raw = JSON.stringify(rowObject(headers, row));
    const code = (row[cCode] ?? '').trim();
    const name = (row[cName] ?? '').trim();
    const nature = (row[cNature] ?? '').trim();
    const parent = cParent >= 0 ? (row[cParent] ?? '').trim() : '';

    if (!code) return invalid(rowNumber, raw, 'CODE_REQUIRED', 'code é obrigatório.', 'code');
    if (seen.has(code)) return invalid(rowNumber, raw, 'DUPLICATE_CODE', `code '${code}' duplicado no arquivo.`, 'code');
    seen.add(code);
    if (!name) return invalid(rowNumber, raw, 'NAME_REQUIRED', 'name é obrigatório.', 'name');
    if (!NATURES.has(nature)) return invalid(rowNumber, raw, 'BAD_NATURE', `nature '${nature}' inválida.`, 'nature');

    const accepts = cAccepts >= 0 ? parseBool(row[cAccepts] ?? '') : true;
    if (accepts === null) return invalid(rowNumber, raw, 'BAD_ACCEPTS_ENTRIES', 'acceptsEntries deve ser true/false.', 'acceptsEntries');

    if (parent && !existingCodes.has(parent) && !fileCodes.has(parent)) {
      return invalid(rowNumber, raw, 'PARENT_NOT_FOUND', `parentCode '${parent}' não existe.`, 'parentCode');
    }

    return {
      rowNumber, rawJson: raw, status: 'VALID', groupKey: null,
      errorCode: null, errorMessage: null, field: null,
      normalizedJson: JSON.stringify({ code, name, nature, acceptsEntries: accepts }),
    };
  });
}

// ─── Opening balances (one balanced entry per file) ─────────────────────────

function validateOpening(table: InTable, accounts: Map<string, AccountLike>): ValidatedRow[] {
  const { headers, rows } = table;
  const cAcc = col(headers, 'accountCode');
  const cDate = col(headers, 'postingDate');
  const cDesc = col(headers, 'description');
  const cDebit = col(headers, 'debitCents');
  const cCredit = col(headers, 'creditCents');

  const validated: ValidatedRow[] = rows.map((row, i) => {
    const rowNumber = i + 2;
    const raw = JSON.stringify(rowObject(headers, row));
    const accountCode = (row[cAcc] ?? '').trim();
    const postingDate = (row[cDate] ?? '').trim();
    const description = cDesc >= 0 ? (row[cDesc] ?? '').trim() : '';
    const acc = accounts.get(accountCode);

    if (!acc) return invalid(rowNumber, raw, 'ACCOUNT_NOT_FOUND', `accountCode '${accountCode}' não existe.`, 'accountCode');
    if (!acc.acceptsEntries) return invalid(rowNumber, raw, 'ACCOUNT_NOT_LEAF', `accountCode '${accountCode}' não aceita lançamentos.`, 'accountCode');
    if (!isValidDateOnly(postingDate)) return invalid(rowNumber, raw, 'BAD_DATE', 'postingDate deve ser YYYY-MM-DD.', 'postingDate');

    const debit = parseCents(row[cDebit] ?? '');
    const credit = parseCents(row[cCredit] ?? '');
    if (debit === null) return invalid(rowNumber, raw, 'BAD_DEBIT', 'debitCents deve ser inteiro ≥ 0.', 'debitCents');
    if (credit === null) return invalid(rowNumber, raw, 'BAD_CREDIT', 'creditCents deve ser inteiro ≥ 0.', 'creditCents');
    if (debit > MAX_CENTS) return invalid(rowNumber, raw, 'DEBIT_TOO_LARGE', `debitCents excede o limite suportado (máx ${MAX_CENTS}).`, 'debitCents');
    if (credit > MAX_CENTS) return invalid(rowNumber, raw, 'CREDIT_TOO_LARGE', `creditCents excede o limite suportado (máx ${MAX_CENTS}).`, 'creditCents');
    if ((debit > 0) === (credit > 0)) return invalid(rowNumber, raw, 'NOT_SINGLE_SIDED', 'Cada linha deve ter débito OU crédito (nunca ambos/nenhum).', 'debitCents');

    return {
      rowNumber, rawJson: raw, status: 'VALID', groupKey: null, errorCode: null, errorMessage: null, field: null,
      normalizedJson: JSON.stringify({ accountCode, postingDate, description, debitCents: debit, creditCents: credit }),
    };
  });

  // Opening balances commit as ONE entry: any invalid row, or an unbalanced file, rejects all.
  const anyInvalid = validated.some((r) => r.status === 'INVALID');
  let debitSum = 0;
  let creditSum = 0;
  for (const r of validated) {
    if (r.normalizedJson) {
      const n = JSON.parse(r.normalizedJson) as { debitCents: number; creditCents: number };
      debitSum += n.debitCents;
      creditSum += n.creditCents;
    }
  }
  const unbalanced = debitSum !== creditSum;

  if (anyInvalid || unbalanced) {
    return validated.map((r) =>
      r.status === 'INVALID'
        ? r
        : invalid(
            r.rowNumber, r.rawJson,
            anyInvalid ? 'FILE_HAS_INVALID_ROW' : 'FILE_UNBALANCED',
            anyInvalid
              ? 'Arquivo tem linhas inválidas — saldos iniciais entram como um único lançamento (tudo ou nada).'
              : `Arquivo não fecha: débito ${debitSum} ≠ crédito ${creditSum}.`,
          ),
    );
  }
  return validated;
}

// ─── Journal entries (grouped by entryKey) ──────────────────────────────────

function validateJournal(table: InTable, accounts: Map<string, AccountLike>): ValidatedRow[] {
  const { headers, rows } = table;
  const idx = {
    key: col(headers, 'entryKey'), doc: col(headers, 'documentDate'), post: col(headers, 'postingDate'),
    desc: col(headers, 'description'), acc: col(headers, 'accountCode'), debit: col(headers, 'debitCents'),
    credit: col(headers, 'creditCents'), line: col(headers, 'lineDescription'), ext: col(headers, 'externalReference'),
  };

  const validated: ValidatedRow[] = rows.map((row, i) => {
    const rowNumber = i + 2;
    const raw = JSON.stringify(rowObject(headers, row));
    const entryKey = (row[idx.key] ?? '').trim();
    const postingDate = (row[idx.post] ?? '').trim();
    const accountCode = (row[idx.acc] ?? '').trim();
    const acc = accounts.get(accountCode);

    if (!entryKey) return invalid(rowNumber, raw, 'ENTRY_KEY_REQUIRED', 'entryKey é obrigatório.', 'entryKey');
    if (!acc) return invalid(rowNumber, raw, 'ACCOUNT_NOT_FOUND', `accountCode '${accountCode}' não existe.`, 'accountCode', entryKey);
    if (!acc.acceptsEntries) return invalid(rowNumber, raw, 'ACCOUNT_NOT_LEAF', `accountCode '${accountCode}' não aceita lançamentos.`, 'accountCode', entryKey);
    if (!isValidDateOnly(postingDate)) return invalid(rowNumber, raw, 'BAD_DATE', 'postingDate deve ser YYYY-MM-DD.', 'postingDate', entryKey);

    const debit = parseCents(row[idx.debit] ?? '');
    const credit = parseCents(row[idx.credit] ?? '');
    if (debit === null) return invalid(rowNumber, raw, 'BAD_DEBIT', 'debitCents deve ser inteiro ≥ 0.', 'debitCents', entryKey);
    if (credit === null) return invalid(rowNumber, raw, 'BAD_CREDIT', 'creditCents deve ser inteiro ≥ 0.', 'creditCents', entryKey);
    if (debit > MAX_CENTS) return invalid(rowNumber, raw, 'DEBIT_TOO_LARGE', `debitCents excede o limite suportado (máx ${MAX_CENTS}).`, 'debitCents', entryKey);
    if (credit > MAX_CENTS) return invalid(rowNumber, raw, 'CREDIT_TOO_LARGE', `creditCents excede o limite suportado (máx ${MAX_CENTS}).`, 'creditCents', entryKey);
    if ((debit > 0) === (credit > 0)) return invalid(rowNumber, raw, 'NOT_SINGLE_SIDED', 'Cada linha deve ter débito OU crédito.', 'debitCents', entryKey);

    return {
      rowNumber, rawJson: raw, status: 'VALID', groupKey: entryKey, errorCode: null, errorMessage: null, field: null,
      normalizedJson: JSON.stringify({
        entryKey,
        documentDate: idx.doc >= 0 ? (row[idx.doc] ?? '').trim() : '',
        postingDate,
        description: idx.desc >= 0 ? (row[idx.desc] ?? '').trim() : '',
        accountCode, debitCents: debit, creditCents: credit,
        lineDescription: idx.line >= 0 ? (row[idx.line] ?? '').trim() : '',
        externalReference: idx.ext >= 0 ? (row[idx.ext] ?? '').trim() : '',
      }),
    };
  });

  // Group-level invariants: ≥2 legs and Σdebit === Σcredit per entryKey. A group with any
  // invalid row cannot post — invalidate its otherwise-valid siblings too.
  const byKey = new Map<string, ValidatedRow[]>();
  for (const r of validated) {
    const key = r.groupKey ?? `__row_${r.rowNumber}`;
    (byKey.get(key) ?? byKey.set(key, []).get(key)!).push(r);
  }

  const failGroup = (rowsInGroup: ValidatedRow[], code: string, msg: string) =>
    rowsInGroup.forEach((r) => {
      if (r.status === 'VALID') {
        r.status = 'INVALID'; r.errorCode = code; r.errorMessage = msg; r.normalizedJson = null;
      }
    });

  for (const [, group] of byKey) {
    if (group.some((r) => r.status === 'INVALID')) {
      failGroup(group, 'GROUP_HAS_INVALID_ROW', 'Lançamento tem linhas inválidas — corrija todas as linhas do entryKey.');
      continue;
    }
    if (group.length < 2) {
      failGroup(group, 'GROUP_TOO_FEW_LINES', 'Lançamento precisa de ao menos 2 partidas.');
      continue;
    }
    let d = 0;
    let c = 0;
    for (const r of group) {
      const n = JSON.parse(r.normalizedJson as string) as { debitCents: number; creditCents: number };
      d += n.debitCents; c += n.creditCents;
    }
    if (d !== c) failGroup(group, 'GROUP_UNBALANCED', `Lançamento não fecha: débito ${d} ≠ crédito ${c}.`);
  }

  return validated;
}

/**
 * Validate a parsed table for an import kind. Throws ImportHeaderError if required columns
 * are missing (whole-file rejection); otherwise returns one ValidatedRow per source row.
 */
export function validateImport(kind: ImportKind, table: InTable, accounts: AccountLike[]): ValidatedRow[] {
  const missing = REQUIRED[kind].filter((c) => !table.headers.includes(c));
  if (missing.length > 0) throw new ImportHeaderError(missing);

  const byCode = new Map(accounts.map((a) => [a.code, a]));
  const codes = new Set(accounts.map((a) => a.code));

  switch (kind) {
    case 'IMPORT_CHART_OF_ACCOUNTS':
      return validateChart(table, codes);
    case 'IMPORT_OPENING_BALANCES':
      return validateOpening(table, byCode);
    case 'IMPORT_JOURNAL_ENTRIES':
      return validateJournal(table, byCode);
  }
}

/** Column templates (used by the template exporter and header docs). */
export const IMPORT_COLUMNS = COLS;
