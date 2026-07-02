import { getCookie } from 'cookies-next';
import { apiClient } from '../api/api-client';
import { notify } from '../notifications/notify';

/**
 * Data Exchange service — typed client over the accounting CSV/XLSX import/export
 * endpoints (`/api/accounting/data-exchange/*`, BE-INCR-6). JSON calls go through
 * apiClient (envelope + auth + error handling); multipart upload and blob download use
 * `fetch` directly because apiClient forces `Content-Type: application/json` and parses
 * every body as JSON. Mirrors the CRM attachment pattern.
 */

export type ImportKind =
  | 'IMPORT_CHART_OF_ACCOUNTS'
  | 'IMPORT_OPENING_BALANCES'
  | 'IMPORT_JOURNAL_ENTRIES';

export type ExportKind =
  | 'EXPORT_TRIAL_BALANCE'
  | 'EXPORT_GENERAL_LEDGER'
  | 'EXPORT_BALANCE_SHEET'
  | 'EXPORT_INCOME_STATEMENT'
  | 'EXPORT_TEMPLATE';

export type SpreadsheetFormat = 'csv' | 'xlsx';

export interface DataExchangeJob {
  id: string;
  direction: string;
  kind: string;
  status: string; // UPLOADED | VALIDATED | COMMITTING | COMMITTED | PARTIAL | FAILED | EXPORTED
  fileName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  sha256: string | null;
  totalRows: number;
  validRows: number;
  invalidRows: number;
  committedRows: number;
  createdAt: string;
}

export interface DataExchangeRow {
  rowNumber: number;
  groupKey: string | null;
  status: string; // VALID | INVALID | COMMITTED | SKIPPED
  errorCode: string | null;
  errorMessage: string | null;
  field: string | null;
  targetType: string | null;
  targetId: string | null;
  raw: unknown;
}

export interface ExportPayload {
  kind: ExportKind;
  format: SpreadsheetFormat;
  unitId: string;
  asOf?: string;
  accountCode?: string;
  templateKind?: ImportKind;
}

interface Envelope<T> {
  success: boolean;
  data: T;
}

function baseUrl(): string {
  return process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:3001/api';
}

function authHeaders(): Record<string, string> {
  const token = getCookie('auth_token');
  const headers: Record<string, string> = {};
  if (token) headers['Authorization'] = `Bearer ${String(token)}`;
  return headers;
}

/** Parse a non-OK fetch response into `{ error, status }` so callers can branch on status. */
async function parseError(response: Response): Promise<Record<string, unknown>> {
  let body: Record<string, unknown> = {};
  try {
    const text = await response.text();
    body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    body = {};
  }
  if (!body.error && !body.message) {
    body.error = `Erro ${response.status}: ${response.statusText}`;
  }
  body.status = response.status;
  return body;
}

/** Stream a fetch response to a browser download via a transient object URL. */
async function streamDownload(url: string, fileName: string): Promise<void> {
  const response = await fetch(url, { method: 'GET', headers: authHeaders() });
  if (!response.ok) throw await parseError(response);
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = fileName || 'download';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

export const dataExchangeService = {
  /** Upload + validate a CSV/XLSX import — stages a VALIDATED job (no ledger write yet). */
  async importFile(kind: ImportKind, unitId: string, file: File): Promise<DataExchangeJob> {
    const form = new FormData();
    form.append('file', file);
    form.append('kind', kind);
    form.append('unitId', unitId);

    const response = await fetch(`${baseUrl()}/accounting/data-exchange/imports`, {
      method: 'POST',
      headers: authHeaders(), // no Content-Type — browser sets the multipart boundary
      body: form,
    });
    if (!response.ok) throw await parseError(response);
    const res = (await response.json()) as Envelope<DataExchangeJob>;
    return res.data;
  },

  /** Job summary (scoped). */
  async getJob(jobId: string, unitId: string): Promise<DataExchangeJob> {
    const res = await apiClient.get<Envelope<DataExchangeJob>>(
      `/accounting/data-exchange/jobs/${encodeURIComponent(jobId)}?unitId=${encodeURIComponent(unitId)}`,
    );
    return res.data;
  },

  /** Rows of an import job (preview + error report), optionally filtered by status. */
  async getRows(jobId: string, unitId: string, status?: string): Promise<DataExchangeRow[]> {
    const statusQs = status ? `&status=${encodeURIComponent(status)}` : '';
    const res = await apiClient.get<Envelope<DataExchangeRow[]>>(
      `/accounting/data-exchange/jobs/${encodeURIComponent(jobId)}/rows?unitId=${encodeURIComponent(unitId)}${statusQs}`,
    );
    return res.data;
  },

  /** Commit a staged import — writes accounts / entries through the posting services. */
  async commit(jobId: string, unitId: string): Promise<DataExchangeJob> {
    const res = await apiClient.post<Envelope<DataExchangeJob>>(
      `/accounting/data-exchange/jobs/${encodeURIComponent(jobId)}/commit`,
      { unitId },
    );
    notify('Importação confirmada.', 'success', 'Contabilidade');
    return res.data;
  },

  /** Render a report/template export artifact (returns the EXPORTED job). */
  async exportReport(payload: ExportPayload): Promise<DataExchangeJob> {
    const res = await apiClient.post<Envelope<DataExchangeJob>>(
      '/accounting/data-exchange/exports',
      payload,
    );
    return res.data;
  },

  /** Download an export/template artifact by job id. */
  async downloadArtifact(jobId: string, unitId: string, fileName: string): Promise<void> {
    await streamDownload(
      `${baseUrl()}/accounting/data-exchange/jobs/${encodeURIComponent(jobId)}/download?unitId=${encodeURIComponent(unitId)}`,
      fileName,
    );
  },

  /** Convenience: export a report and immediately download it. */
  async exportAndDownload(payload: ExportPayload, fileName: string): Promise<void> {
    const job = await this.exportReport(payload);
    await this.downloadArtifact(job.id, payload.unitId, fileName);
    notify('Exportação concluída.', 'success', 'Contabilidade');
  },

  /** Convenience: download a blank import template for a given kind. */
  async downloadTemplate(templateKind: ImportKind, unitId: string, format: SpreadsheetFormat): Promise<void> {
    await this.exportAndDownload(
      { kind: 'EXPORT_TEMPLATE', templateKind, format, unitId },
      `template-${templateKind.toLowerCase()}.${format}`,
    );
  },
};
