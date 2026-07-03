// React default import: tsconfig uses jsx:"preserve", so vitest/esbuild transforms JSX with the
// classic runtime and needs React in scope (same pattern as crm/ui/StatusBadge, the tested precedent).
import React, { useRef, useState } from 'react';
import { FiUploadCloud, FiDownload, FiCheckCircle, FiAlertTriangle, FiRefreshCw } from 'react-icons/fi';
import {
  dataExchangeService,
  type ImportKind,
  type ExportKind,
  type SpreadsheetFormat,
  type DataExchangeJob,
  type DataExchangeRow,
} from '../../../lib/services/dataExchange.service';

const IMPORT_KINDS: Array<{ id: ImportKind; label: string }> = [
  { id: 'IMPORT_CHART_OF_ACCOUNTS', label: 'Plano de Contas' },
  { id: 'IMPORT_OPENING_BALANCES', label: 'Saldos Iniciais' },
  { id: 'IMPORT_JOURNAL_ENTRIES', label: 'Lançamentos' },
];

const EXPORT_KINDS: Array<{ id: ExportKind; label: string }> = [
  { id: 'EXPORT_TRIAL_BALANCE', label: 'Balancete' },
  { id: 'EXPORT_GENERAL_LEDGER', label: 'Razão' },
  { id: 'EXPORT_BALANCE_SHEET', label: 'Balanço Patrimonial' },
  { id: 'EXPORT_INCOME_STATEMENT', label: 'DRE' },
];

const inputClass =
  'rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 focus:border-emerald-500 focus:outline-none disabled:opacity-50';

function resolveError(e: unknown): string {
  if (e && typeof e === 'object') {
    const o = e as { error?: unknown; message?: unknown };
    if (typeof o.error === 'string') return o.error;
    if (typeof o.message === 'string') return o.message;
  }
  return 'Ocorreu um erro. Tente novamente.';
}

/**
 * Status → badge classes (COMMITTED green, PARTIAL amber, FAILED red, else neutral).
 * A COMMITTED/VALIDATED job with validation-rejected rows goes amber too: those rows never
 * enter validRows, so the backend status is legitimately COMMITTED — but a green badge next
 * to "Inválidas: N" reads as fully clean when it wasn't (FE-INCR6 J2).
 */
export function statusBadge(status: string, invalidRows = 0): string {
  if (status === 'COMMITTED' || status === 'VALIDATED') {
    return invalidRows > 0 ? 'bg-amber-600/15 text-amber-400' : 'bg-emerald-600/15 text-emerald-400';
  }
  if (status === 'PARTIAL') return 'bg-amber-600/15 text-amber-400';
  if (status === 'FAILED') return 'bg-red-600/15 text-red-400';
  return 'bg-neutral-700/40 text-neutral-300';
}

export function ImportExportPanel({
  unitId,
  onCommitSuccess,
}: {
  unitId: string;
  /** Fired after a commit writes rows — lets the parent refetch the (already-mounted) Balancete (FE-INCR6 W1). */
  onCommitSuccess?: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  // Import state
  const [importKind, setImportKind] = useState<ImportKind>('IMPORT_JOURNAL_ENTRIES');
  const [templateFormat, setTemplateFormat] = useState<SpreadsheetFormat>('csv');
  const [uploading, setUploading] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [job, setJob] = useState<DataExchangeJob | null>(null);
  const [rows, setRows] = useState<DataExchangeRow[]>([]);
  const [importError, setImportError] = useState<string | null>(null);

  // Export state
  const [exportKind, setExportKind] = useState<ExportKind>('EXPORT_TRIAL_BALANCE');
  const [exportFormat, setExportFormat] = useState<SpreadsheetFormat>('xlsx');
  const [asOf, setAsOf] = useState('');
  const [accountCode, setAccountCode] = useState('');
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const needsAsOf = exportKind === 'EXPORT_BALANCE_SHEET' || exportKind === 'EXPORT_INCOME_STATEMENT';
  const needsAccount = exportKind === 'EXPORT_GENERAL_LEDGER';

  async function refreshRows(jobId: string) {
    try {
      setRows(await dataExchangeService.getRows(jobId, unitId));
    } catch {
      /* preview is best-effort */
    }
  }

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file
    if (!file) return;
    setUploading(true);
    setImportError(null);
    setJob(null);
    setRows([]);
    try {
      const created = await dataExchangeService.importFile(importKind, unitId, file);
      setJob(created);
      await refreshRows(created.id);
    } catch (err) {
      const status = (err as { status?: number })?.status;
      if (status === 415) setImportError('Arquivo inválido — envie CSV ou XLSX.');
      else if (status === 413) setImportError('Arquivo muito grande.');
      else setImportError(resolveError(err));
    } finally {
      setUploading(false);
    }
  }

  async function handleCommit() {
    if (!job) return;
    setCommitting(true);
    setImportError(null);
    try {
      const result = await dataExchangeService.commit(job.id, unitId);
      setJob(result);
      await refreshRows(result.id);
      // Only a commit that actually wrote rows changes the ledger views.
      if (result.committedRows > 0) onCommitSuccess?.();
    } catch (err) {
      setImportError(resolveError(err));
    } finally {
      setCommitting(false);
    }
  }

  async function handleTemplate() {
    setImportError(null);
    try {
      await dataExchangeService.downloadTemplate(importKind, unitId, templateFormat);
    } catch (err) {
      setImportError(resolveError(err));
    }
  }

  async function handleExport() {
    setExportError(null);
    if (needsAsOf && !asOf) {
      setExportError('Informe a data (asOf) para BP/DRE.');
      return;
    }
    if (needsAccount && !accountCode) {
      setExportError('Informe o código da conta para o Razão.');
      return;
    }
    setExporting(true);
    try {
      const fileName = `${exportKind.toLowerCase()}.${exportFormat}`;
      await dataExchangeService.exportAndDownload(
        {
          kind: exportKind,
          format: exportFormat,
          unitId,
          asOf: needsAsOf ? asOf : undefined,
          accountCode: needsAccount ? accountCode : undefined,
        },
        fileName,
      );
    } catch (err) {
      setExportError(resolveError(err));
    } finally {
      setExporting(false);
    }
  }

  const committable = job !== null && job.validRows > 0 && job.status !== 'COMMITTED';
  const invalidRows = rows.filter((r) => r.status === 'INVALID');
  const previewRows = invalidRows.length > 0 ? invalidRows : rows;

  return (
    <div className="space-y-8">
      {/* ── Importação ─────────────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-neutral-800 bg-neutral-900/50 p-5">
        <h2 className="mb-1 text-lg font-semibold text-neutral-200">Importação</h2>
        <p className="mb-4 text-sm text-neutral-500">
          Envie um CSV/XLSX, revise a validação e confirme. Nada é gravado até você confirmar.
        </p>

        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm text-neutral-400">
            Tipo
            <select value={importKind} onChange={(e) => setImportKind(e.target.value as ImportKind)} className={inputClass}>
              {IMPORT_KINDS.map((k) => (
                <option key={k.id} value={k.id}>{k.label}</option>
              ))}
            </select>
          </label>

          <select value={templateFormat} onChange={(e) => setTemplateFormat(e.target.value as SpreadsheetFormat)} className={inputClass}>
            <option value="csv">CSV</option>
            <option value="xlsx">XLSX</option>
          </select>
          <button
            type="button"
            onClick={handleTemplate}
            className="inline-flex items-center gap-2 rounded-xl border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm font-medium text-neutral-200 transition-colors hover:bg-neutral-700"
          >
            <FiDownload size={15} /> Baixar modelo
          </button>

          <input ref={fileRef} type="file" accept=".csv,.xlsx" onChange={handleFileSelected} className="hidden" />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 active:bg-emerald-700 disabled:opacity-50"
          >
            <FiUploadCloud size={16} /> {uploading ? 'Enviando…' : 'Selecionar arquivo'}
          </button>
        </div>

        {importError && (
          <div className="mt-4 rounded-xl border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-300">
            {importError}
          </div>
        )}

        {job && (
          <div className="mt-5">
            <div className="mb-3 flex flex-wrap items-center gap-3 text-sm">
              <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${statusBadge(job.status, job.invalidRows)}`}>
                {(job.status === 'COMMITTED' || job.status === 'VALIDATED') && job.invalidRows === 0 ? <FiCheckCircle size={13} /> : <FiAlertTriangle size={13} />}
                {job.status}
              </span>
              <span className="text-neutral-400">Total: <strong className="text-neutral-200">{job.totalRows}</strong></span>
              <span className="text-emerald-400">Válidas: <strong>{job.validRows}</strong></span>
              <span className="text-red-400">Inválidas: <strong>{job.invalidRows}</strong></span>
              {job.committedRows > 0 && <span className="text-neutral-300">Gravadas: <strong>{job.committedRows}</strong></span>}
            </div>

            {previewRows.length > 0 && (
              <div className="overflow-hidden rounded-2xl border border-neutral-800">
                <table className="w-full text-left text-sm">
                  <thead className="bg-neutral-900 text-xs uppercase text-neutral-500">
                    <tr>
                      <th className="px-3 py-2">Linha</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">Campo</th>
                      <th className="px-3 py-2">Erro</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-800">
                    {previewRows.slice(0, 200).map((r) => (
                      <tr key={r.rowNumber} className="text-neutral-300">
                        <td className="px-3 py-2 tabular-nums">{r.rowNumber}</td>
                        <td className="px-3 py-2">
                          <span className={`rounded-full px-2 py-0.5 text-xs ${statusBadge(r.status)}`}>{r.status}</span>
                        </td>
                        <td className="px-3 py-2 text-neutral-400">{r.field ?? '—'}</td>
                        <td className="px-3 py-2 text-neutral-400">{r.errorMessage ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {previewRows.length > 200 && (
                  <div className="bg-neutral-900 px-3 py-2 text-xs text-neutral-500">
                    Mostrando 200 de {previewRows.length} linhas.
                  </div>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={handleCommit}
              disabled={!committable || committing}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 active:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {committing ? <FiRefreshCw className="animate-spin" size={16} /> : <FiCheckCircle size={16} />}
              {committing ? 'Confirmando…' : `Confirmar importação (${job.validRows})`}
            </button>
          </div>
        )}
      </section>

      {/* ── Exportação ─────────────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-neutral-800 bg-neutral-900/50 p-5">
        <h2 className="mb-1 text-lg font-semibold text-neutral-200">Exportação</h2>
        <p className="mb-4 text-sm text-neutral-500">Baixe relatórios em CSV ou XLSX.</p>

        <div className="flex flex-wrap items-end gap-3">
          <label className="flex items-center gap-2 text-sm text-neutral-400">
            Relatório
            <select value={exportKind} onChange={(e) => setExportKind(e.target.value as ExportKind)} className={inputClass}>
              {EXPORT_KINDS.map((k) => (
                <option key={k.id} value={k.id}>{k.label}</option>
              ))}
            </select>
          </label>

          {needsAsOf && (
            <label className="flex items-center gap-2 text-sm text-neutral-400">
              Data
              <input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} className={inputClass} />
            </label>
          )}
          {needsAccount && (
            <label className="flex items-center gap-2 text-sm text-neutral-400">
              Conta
              <input type="text" value={accountCode} onChange={(e) => setAccountCode(e.target.value)} placeholder="1.1.1" className={inputClass} />
            </label>
          )}

          <select value={exportFormat} onChange={(e) => setExportFormat(e.target.value as SpreadsheetFormat)} className={inputClass}>
            <option value="csv">CSV</option>
            <option value="xlsx">XLSX</option>
          </select>

          <button
            type="button"
            onClick={handleExport}
            disabled={exporting}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 active:bg-emerald-700 disabled:opacity-50"
          >
            <FiDownload size={16} /> {exporting ? 'Exportando…' : 'Exportar'}
          </button>
        </div>

        {exportError && (
          <div className="mt-4 rounded-xl border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-300">
            {exportError}
          </div>
        )}
      </section>
    </div>
  );
}
