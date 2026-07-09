import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'next-i18next';
import {
  FiUploadCloud,
  FiZap,
  FiTrash2,
  FiChevronDown,
  FiChevronRight,
  FiRefreshCw,
  FiEyeOff,
  FiLink,
} from 'react-icons/fi';
import { Modal } from '../../../components/ui/Modal';
import { StandardPagination } from '../../dashboard/shared/components/StandardPagination';
import {
  accountingService,
  type Account,
  type BankStatement,
  type BankStatementLine,
  type BankStatementLineStatus,
  type PendingReport,
} from '../../../lib/services/accounting.service';
import { formatCents } from '../lib/formatCents';
import { formatDate } from '../lib/formatDate';
import { ReconciliationMatchModal } from './ReconciliationMatchModal';

const STATEMENTS_PER_PAGE = 10;

const inputClass =
  'rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 focus:border-emerald-500 focus:outline-none disabled:opacity-50';

/** Extract a human message from apiClient's thrown error object. */
function resolveError(e: unknown, fallback: string): string {
  if (e && typeof e === 'object') {
    const o = e as { error?: unknown; message?: unknown };
    if (typeof o.error === 'string') return o.error;
    if (typeof o.message === 'string') return o.message;
  }
  return fallback;
}

// ── Line status badge ───────────────────────────────────────────────────────────

function LineStatusBadge({ status }: { status: BankStatementLineStatus }) {
  const { t } = useTranslation('accounting');
  const CLASS: Record<BankStatementLineStatus, string> = {
    UNMATCHED: 'bg-amber-600/15 text-amber-400',
    MATCHED: 'bg-emerald-600/15 text-emerald-400',
    IGNORED: 'bg-neutral-700/50 text-neutral-400',
  };
  const FALLBACK: Record<BankStatementLineStatus, string> = {
    UNMATCHED: 'Pendente',
    MATCHED: 'Conciliada',
    IGNORED: 'Ignorada',
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${CLASS[status]}`}>
      {t(`reconciliation.lines.status.${status}`, FALLBACK[status])}
    </span>
  );
}

// ── Statement row (expandable to its lines) ──────────────────────────────────────

interface StatementRowProps {
  statement: BankStatement;
  unitId: string;
  accountLabel: (glAccountId: string) => string;
  onAutoMatch: (statement: BankStatement) => void;
  autoMatching: boolean;
  onDelete: (statement: BankStatement) => void;
}

function StatementRow({
  statement,
  unitId,
  accountLabel,
  onAutoMatch,
  autoMatching,
  onDelete,
}: StatementRowProps) {
  const { t } = useTranslation('accounting');
  const [expanded, setExpanded] = useState(false);
  const [lines, setLines] = useState<BankStatementLine[]>([]);
  const [loadingLines, setLoadingLines] = useState(false);

  const loadLines = useCallback(async () => {
    setLoadingLines(true);
    try {
      const result = await accountingService.listStatementLines(statement.id, unitId);
      setLines(result.lines);
    } catch {
      setLines([]);
    } finally {
      setLoadingLines(false);
    }
  }, [statement.id, unitId]);

  const toggle = () => {
    const next = !expanded;
    setExpanded(next);
    if (next) void loadLines();
  };

  return (
    <>
      <tr className="border-b border-neutral-800/60 transition-colors hover:bg-neutral-800/30 last:border-0">
        <td className="w-8 cursor-pointer px-3 py-2.5 text-neutral-500" onClick={toggle}>
          {expanded ? <FiChevronDown size={14} /> : <FiChevronRight size={14} />}
        </td>
        <td className="px-4 py-2.5 tabular-nums text-neutral-300">
          {formatDate(statement.periodStart)} — {formatDate(statement.periodEnd)}
        </td>
        <td className="px-4 py-2.5 text-neutral-300">
          <span className="font-mono text-xs text-neutral-500">{accountLabel(statement.glAccountId)}</span>
        </td>
        <td className="px-4 py-2.5 text-neutral-400">{statement.statementRef ?? '—'}</td>
        <td className="px-4 py-2.5 tabular-nums text-neutral-500">{formatDate(statement.createdAt)}</td>
        <td className="px-4 py-2.5">
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => onAutoMatch(statement)}
              disabled={autoMatching}
              className="inline-flex items-center gap-1.5 rounded-xl border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-xs font-medium text-neutral-300 transition-colors hover:border-emerald-700 hover:bg-emerald-900/30 hover:text-emerald-300 disabled:opacity-40"
            >
              {autoMatching ? <FiRefreshCw className="animate-spin" size={12} /> : <FiZap size={12} />}
              {autoMatching
                ? t('reconciliation.statements.autoMatching', 'Conciliando…')
                : t('reconciliation.statements.autoMatch', 'Auto-conciliar')}
            </button>
            <button
              type="button"
              onClick={() => onDelete(statement)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-xs font-medium text-neutral-300 transition-colors hover:border-red-700 hover:bg-red-900/30 hover:text-red-300"
            >
              <FiTrash2 size={12} />
              {t('reconciliation.statements.delete', 'Excluir')}
            </button>
          </div>
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={6} className="bg-neutral-950/60 px-6 pb-3 pt-1">
            {loadingLines ? (
              <div className="py-4 text-center text-xs text-neutral-500">
                {t('reconciliation.lines.loading', 'Carregando linhas…')}
              </div>
            ) : lines.length === 0 ? (
              <div className="py-4 text-center text-xs text-neutral-500">
                {t('reconciliation.lines.empty', 'Nenhuma linha neste extrato.')}
              </div>
            ) : (
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-left text-neutral-500">
                    <th className="py-1 pr-4 font-medium">{t('reconciliation.lines.col.line', 'Linha')}</th>
                    <th className="py-1 pr-4 font-medium">{t('reconciliation.lines.col.date', 'Data')}</th>
                    <th className="py-1 pr-4 font-medium">{t('reconciliation.lines.col.description', 'Histórico')}</th>
                    <th className="py-1 pr-4 text-right font-medium">{t('reconciliation.lines.col.amount', 'Valor')}</th>
                    <th className="py-1 font-medium">{t('reconciliation.lines.col.status', 'Status')}</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line) => (
                    <tr key={line.id} className="border-t border-neutral-800/50">
                      <td className="py-1 pr-4 tabular-nums text-neutral-500">{line.lineNumber}</td>
                      <td className="py-1 pr-4 tabular-nums text-neutral-300">{formatDate(line.date)}</td>
                      <td className="py-1 pr-4 text-neutral-300">{line.description}</td>
                      <td
                        className={`py-1 pr-4 text-right tabular-nums ${line.amountCents < 0 ? 'text-rose-400' : 'text-neutral-300'}`}
                      >
                        {formatCents(line.amountCents)}
                      </td>
                      <td className="py-1">
                        <LineStatusBadge status={line.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

// ── Extratos sub-view (Stream A) ────────────────────────────────────────────────

interface StatementsSubViewProps {
  unitId: string;
  glAccountId: string;
  accountLabel: (glAccountId: string) => string;
  onLedgerChange?: () => void;
}

function StatementsSubView({ unitId, glAccountId, accountLabel, onLedgerChange }: StatementsSubViewProps) {
  const { t } = useTranslation('accounting');
  const fileRef = useRef<HTMLInputElement>(null);

  const [statements, setStatements] = useState<BankStatement[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // import form
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [statementRef, setStatementRef] = useState('');
  const [openingBalance, setOpeningBalance] = useState('');
  const [closingBalance, setClosingBalance] = useState('');
  const [uploading, setUploading] = useState(false);

  const [autoMatchingId, setAutoMatchingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<BankStatement | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchStatements = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await accountingService.listBankStatements(unitId, page, STATEMENTS_PER_PAGE);
      setStatements(result.statements);
      setTotal(result.total);
    } catch (e) {
      setError(resolveError(e, t('reconciliation.error.load', 'Erro ao carregar a conciliação.')));
      setStatements([]);
      setTotal(0);
    } finally {
      setLoading(false);
    }
  }, [unitId, page, t]);

  useEffect(() => {
    void fetchStatements();
  }, [fetchStatements]);

  async function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file
    if (!file) return;
    setError(null);
    setNotice(null);
    if (!glAccountId) {
      setError(t('reconciliation.import.needAccount', 'Selecione a conta-banco.'));
      return;
    }
    if (!periodStart || !periodEnd) {
      setError(t('reconciliation.import.needPeriod', 'Informe o início e o fim do período.'));
      return;
    }
    setUploading(true);
    try {
      const result = await accountingService.importBankStatement(
        {
          unitId,
          glAccountId,
          periodStart,
          periodEnd,
          statementRef: statementRef.trim() || undefined,
          openingBalanceCents: openingBalance.trim() ? Number(openingBalance) : undefined,
          closingBalanceCents: closingBalance.trim() ? Number(closingBalance) : undefined,
        },
        file,
      );
      setNotice(
        result.created
          ? t('reconciliation.import.success', 'Extrato importado: {{count}} linha(s).', { count: result.lineCount })
          : t('reconciliation.import.idempotent', 'Arquivo já importado — nada foi alterado ({{count}} linha(s)).', {
              count: result.lineCount,
            }),
      );
      setPage(1);
      await fetchStatements();
    } catch (err) {
      const status = (err as { status?: number })?.status;
      if (status === 413) setError(t('reconciliation.import.tooLarge', 'Arquivo muito grande.'));
      else setError(resolveError(err, t('reconciliation.error.generic', 'Ocorreu um erro. Tente novamente.')));
    } finally {
      setUploading(false);
    }
  }

  async function handleAutoMatch(statement: BankStatement) {
    setAutoMatchingId(statement.id);
    setError(null);
    setNotice(null);
    try {
      const summary = await accountingService.autoMatchStatement(statement.id, unitId);
      setNotice(
        t(
          'reconciliation.statements.autoMatchResult',
          'Auto-conciliação: {{matched}} conciliada(s), {{ambiguous}} ambígua(s), {{zero}} sem candidato (de {{processed}}).',
          {
            matched: summary.matched,
            ambiguous: summary.ambiguous,
            zero: summary.zeroCandidates,
            processed: summary.processed,
          },
        ),
      );
      await fetchStatements();
      if (summary.matched > 0) onLedgerChange?.();
    } catch (e) {
      setError(resolveError(e, t('reconciliation.error.generic', 'Ocorreu um erro. Tente novamente.')));
    } finally {
      setAutoMatchingId(null);
    }
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setError(null);
    try {
      await accountingService.deleteBankStatement(deleteTarget.id, unitId);
      setDeleteTarget(null);
      // A deleted statement may have been the last page's only row.
      if (statements.length === 1 && page > 1) setPage((p) => p - 1);
      else await fetchStatements();
    } catch (e) {
      setError(resolveError(e, t('reconciliation.error.generic', 'Ocorreu um erro. Tente novamente.')));
    } finally {
      setDeleting(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / STATEMENTS_PER_PAGE));

  return (
    <div className="space-y-6">
      {/* Import form */}
      <section className="rounded-2xl border border-neutral-800 bg-neutral-900/50 p-5">
        <h3 className="mb-1 text-base font-semibold text-neutral-200">
          {t('reconciliation.import.title', 'Importar extrato')}
        </h3>
        <p className="mb-4 text-sm text-neutral-500">
          {t(
            'reconciliation.import.description',
            'Envie um CSV/XLSX (colunas: date, amountCents, description[, externalRef]). Valores em centavos sinalizados. Reimportar o mesmo arquivo é idempotente.',
          )}
        </p>

        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs text-neutral-400">
            {t('reconciliation.import.periodStart', 'Início do período')}
            <input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} className={inputClass} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-neutral-400">
            {t('reconciliation.import.periodEnd', 'Fim do período')}
            <input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} className={inputClass} />
          </label>
          <label className="flex flex-col gap-1 text-xs text-neutral-400">
            {t('reconciliation.import.statementRef', 'Referência (opcional)')}
            <input
              type="text"
              value={statementRef}
              onChange={(e) => setStatementRef(e.target.value)}
              placeholder={t('reconciliation.import.statementRefPlaceholder', 'Ex.: Extrato Jul/2026')}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-neutral-400">
            {t('reconciliation.import.openingBalance', 'Saldo inicial (centavos)')}
            <input
              type="number"
              value={openingBalance}
              onChange={(e) => setOpeningBalance(e.target.value)}
              className={inputClass}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-neutral-400">
            {t('reconciliation.import.closingBalance', 'Saldo final (centavos)')}
            <input
              type="number"
              value={closingBalance}
              onChange={(e) => setClosingBalance(e.target.value)}
              className={inputClass}
            />
          </label>

          <input ref={fileRef} type="file" accept=".csv,.xlsx" onChange={handleFileSelected} className="hidden" />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading || !glAccountId}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 active:bg-emerald-700 disabled:opacity-50"
          >
            <FiUploadCloud size={16} />
            {uploading
              ? t('reconciliation.import.uploading', 'Enviando…')
              : t('reconciliation.import.selectFile', 'Selecionar arquivo')}
          </button>
        </div>
      </section>

      {notice && (
        <div className="rounded-xl border border-emerald-900/50 bg-emerald-950/30 px-4 py-3 text-sm text-emerald-300">
          {notice}
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-300">{error}</div>
      )}

      {/* Statements list */}
      {loading && (
        <div className="py-16 text-center text-neutral-400">
          {t('reconciliation.statements.loading', 'Carregando extratos…')}
        </div>
      )}
      {!loading && statements.length === 0 && !error && (
        <div className="py-16 text-center text-neutral-500">
          {t('reconciliation.statements.empty', 'Nenhum extrato importado para esta unidade.')}
        </div>
      )}
      {!loading && statements.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900/50">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-800 text-left text-neutral-400">
                <th className="w-8 px-3 py-3" aria-label={t('reconciliation.statements.viewLines', 'Ver linhas')} />
                <th className="px-4 py-3 font-medium">{t('reconciliation.statements.col.period', 'Período')}</th>
                <th className="px-4 py-3 font-medium">{t('reconciliation.bankAccount', 'Conta bancária')}</th>
                <th className="px-4 py-3 font-medium">{t('reconciliation.statements.col.ref', 'Referência')}</th>
                <th className="px-4 py-3 font-medium">{t('reconciliation.statements.col.imported', 'Importado em')}</th>
                <th className="px-4 py-3 text-right font-medium">{t('reconciliation.statements.col.actions', 'Ações')}</th>
              </tr>
            </thead>
            <tbody>
              {statements.map((statement) => (
                <StatementRow
                  key={statement.id}
                  statement={statement}
                  unitId={unitId}
                  accountLabel={accountLabel}
                  onAutoMatch={handleAutoMatch}
                  autoMatching={autoMatchingId === statement.id}
                  onDelete={setDeleteTarget}
                />
              ))}
            </tbody>
          </table>
          <StandardPagination
            currentPage={page}
            totalPages={totalPages}
            totalItems={total}
            itemsPerPage={STATEMENTS_PER_PAGE}
            onPageChange={setPage}
            scrollToTop={false}
          />
        </div>
      )}

      {/* Delete confirmation */}
      <Modal
        isOpen={!!deleteTarget}
        onClose={() => {
          if (!deleting) setDeleteTarget(null);
        }}
        title={t('reconciliation.deleteConfirm.title', 'Excluir extrato?')}
        themeColor="bg-red-600"
        maxWidth="max-w-lg"
        footer={
          <>
            <button
              type="button"
              onClick={() => setDeleteTarget(null)}
              disabled={deleting}
              className="rounded-xl border border-neutral-700 bg-neutral-800 px-4 py-2 text-sm font-medium text-neutral-300 transition-colors hover:bg-neutral-700 disabled:opacity-50"
            >
              {t('reconciliation.deleteConfirm.cancel', 'Cancelar')}
            </button>
            <button
              type="button"
              onClick={() => void handleConfirmDelete()}
              disabled={deleting}
              className="inline-flex items-center gap-2 rounded-xl bg-red-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-600 disabled:opacity-50"
            >
              <FiTrash2 size={14} />
              {deleting
                ? t('reconciliation.deleteConfirm.deleting', 'Excluindo…')
                : t('reconciliation.deleteConfirm.confirm', 'Sim, excluir')}
            </button>
          </>
        }
      >
        <div className="px-6 py-5 text-sm text-neutral-300">
          {t(
            'reconciliation.deleteConfirm.message',
            'Excluir este extrato e suas linhas? Bloqueado se houver vínculo ativo. Esta ação não pode ser desfeita.',
          )}
        </div>
      </Modal>
    </div>
  );
}

// ── Fila pendente sub-view (Stream B) ────────────────────────────────────────────

interface PendingSubViewProps {
  unitId: string;
  glAccountId: string;
  onLedgerChange?: () => void;
}

function PendingSubView({ unitId, glAccountId, onLedgerChange }: PendingSubViewProps) {
  const { t } = useTranslation('accounting');
  const [report, setReport] = useState<PendingReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [ignoringId, setIgnoringId] = useState<string | null>(null);
  const [matchLine, setMatchLine] = useState<BankStatementLine | null>(null);

  const fetchReport = useCallback(async () => {
    if (!glAccountId) {
      setReport(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await accountingService.getPendingReport({
        unitId,
        glAccountId,
        from: from || undefined,
        to: to || undefined,
      });
      setReport(result);
    } catch (e) {
      setError(resolveError(e, t('reconciliation.error.load', 'Erro ao carregar a conciliação.')));
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, [unitId, glAccountId, from, to, t]);

  useEffect(() => {
    void fetchReport();
  }, [fetchReport]);

  async function handleIgnore(line: BankStatementLine) {
    setIgnoringId(line.id);
    setError(null);
    try {
      await accountingService.setLineIgnored(line.id, unitId, true);
      await fetchReport();
    } catch (e) {
      setError(resolveError(e, t('reconciliation.error.generic', 'Ocorreu um erro. Tente novamente.')));
    } finally {
      setIgnoringId(null);
    }
  }

  const totalsLabel = useMemo(() => {
    if (!report) return '';
    return t('reconciliation.pending.totals', '{{lineCount}} linha(s) · Σ {{lineTotal}} · {{postingCount}} lançamento(s)', {
      lineCount: report.totals.lineCount,
      lineTotal: formatCents(report.totals.lineTotalCents),
      postingCount: report.totals.postingCount,
    });
  }, [report, t]);

  if (!glAccountId) {
    return (
      <div className="py-16 text-center text-neutral-500">
        {t('reconciliation.pending.selectAccount', 'Selecione uma conta-banco para ver as pendências.')}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-neutral-400">
          {t('reconciliation.pending.filters.from', 'De')}
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputClass} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-neutral-400">
          {t('reconciliation.pending.filters.to', 'Até')}
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputClass} />
        </label>
        <button
          type="button"
          onClick={() => void fetchReport()}
          className="inline-flex items-center gap-2 rounded-xl border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm font-medium text-neutral-200 transition-colors hover:bg-neutral-700"
        >
          <FiRefreshCw size={14} /> {t('reconciliation.pending.refresh', 'Atualizar')}
        </button>
        {report && <span className="ml-auto text-xs text-neutral-500">{totalsLabel}</span>}
      </div>

      {error && (
        <div className="rounded-xl border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-300">{error}</div>
      )}
      {loading && (
        <div className="py-16 text-center text-neutral-400">
          {t('reconciliation.pending.loading', 'Carregando pendências…')}
        </div>
      )}

      {!loading && report && (
        <>
          {/* Unmatched statement lines */}
          <section>
            <h3 className="mb-2 text-[10px] font-black uppercase tracking-widest text-neutral-400">
              {t('reconciliation.pending.lines.title', 'Linhas do extrato sem conciliação')}
            </h3>
            {report.unmatchedLines.length === 0 ? (
              <div className="rounded-2xl border border-neutral-800 bg-neutral-900/50 py-8 text-center text-sm text-neutral-500">
                {t('reconciliation.pending.lines.empty', 'Nenhuma linha pendente.')}
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900/50">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-neutral-800 text-left text-neutral-400">
                      <th className="px-4 py-3 font-medium">{t('reconciliation.pending.col.date', 'Data')}</th>
                      <th className="px-4 py-3 font-medium">{t('reconciliation.pending.col.description', 'Histórico')}</th>
                      <th className="px-4 py-3 text-right font-medium">{t('reconciliation.pending.col.amount', 'Valor')}</th>
                      <th className="px-4 py-3 text-right font-medium">{t('reconciliation.pending.col.actions', 'Ações')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.unmatchedLines.map((line) => (
                      <tr key={line.id} className="border-b border-neutral-800/60 last:border-0 hover:bg-neutral-800/30">
                        <td className="px-4 py-2.5 tabular-nums text-neutral-300">{formatDate(line.date)}</td>
                        <td className="px-4 py-2.5 text-neutral-200">{line.description}</td>
                        <td
                          className={`px-4 py-2.5 text-right tabular-nums ${line.amountCents < 0 ? 'text-rose-400' : 'text-neutral-300'}`}
                        >
                          {formatCents(line.amountCents)}
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => setMatchLine(line)}
                              className="inline-flex items-center gap-1.5 rounded-xl border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-xs font-medium text-neutral-300 transition-colors hover:border-blue-700 hover:bg-blue-900/30 hover:text-blue-300"
                            >
                              <FiLink size={12} /> {t('reconciliation.pending.suggestions', 'Sugestões')}
                            </button>
                            <button
                              type="button"
                              onClick={() => void handleIgnore(line)}
                              disabled={ignoringId === line.id}
                              className="inline-flex items-center gap-1.5 rounded-xl border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-xs font-medium text-neutral-300 transition-colors hover:bg-neutral-700 disabled:opacity-40"
                            >
                              <FiEyeOff size={12} />
                              {ignoringId === line.id
                                ? t('reconciliation.pending.ignoring', 'Ignorando…')
                                : t('reconciliation.pending.ignore', 'Ignorar')}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Unmatched bank postings (read-only context) */}
          <section>
            <h3 className="mb-2 text-[10px] font-black uppercase tracking-widest text-neutral-400">
              {t('reconciliation.pending.postings.title', 'Lançamentos do banco sem conciliação')}
            </h3>
            {report.unmatchedPostings.length === 0 ? (
              <div className="rounded-2xl border border-neutral-800 bg-neutral-900/50 py-8 text-center text-sm text-neutral-500">
                {t('reconciliation.pending.postings.empty', 'Nenhum lançamento pendente.')}
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900/50">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-neutral-800 text-left text-neutral-400">
                      <th className="px-4 py-3 font-medium">{t('reconciliation.pending.col.date', 'Data')}</th>
                      <th className="px-4 py-3 font-medium">{t('reconciliation.pending.col.entry', 'Lançamento')}</th>
                      <th className="px-4 py-3 text-right font-medium">{t('reconciliation.pending.col.amount', 'Valor')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.unmatchedPostings.map((posting) => {
                      const amount = posting.debitCents || posting.creditCents;
                      return (
                        <tr key={posting.id} className="border-b border-neutral-800/60 last:border-0 hover:bg-neutral-800/30">
                          <td className="px-4 py-2.5 tabular-nums text-neutral-300">{formatDate(posting.entry.date)}</td>
                          <td className="px-4 py-2.5 text-neutral-200">
                            <span className="line-clamp-1">{posting.entry.description}</span>
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums text-neutral-300">{formatCents(amount)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      <ReconciliationMatchModal
        isOpen={!!matchLine}
        onClose={() => setMatchLine(null)}
        unitId={unitId}
        line={matchLine}
        onMatched={() => {
          void fetchReport();
          onLedgerChange?.();
        }}
      />
    </div>
  );
}

// ── Panel ────────────────────────────────────────────────────────────────────────

interface ReconciliationPanelProps {
  unitId: string;
  /** Refetch the ledger views (balancete) when a match flips an entry status (D5/W1). */
  onLedgerChange?: () => void;
}

type SubTab = 'extratos' | 'pendentes';

/**
 * ReconciliationPanel — bank reconciliation workspace (FE-INCR-7). A shared bank
 * GL account selector drives both sub-views: "Extratos" (import + auto-match +
 * delete statements) and "Fila pendente" (UNMATCHED lines → suggest/match/ignore).
 * Money is INTEGER CENTS; the UI only formats.
 */
export function ReconciliationPanel({ unitId, onLedgerChange }: ReconciliationPanelProps) {
  const { t } = useTranslation('accounting');
  const [sub, setSub] = useState<SubTab>('extratos');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [glAccountId, setGlAccountId] = useState('');
  const [loadingAccounts, setLoadingAccounts] = useState(true);

  useEffect(() => {
    let active = true;
    setLoadingAccounts(true);
    accountingService
      .getAccounts(unitId)
      .then((r) => {
        if (!active) return;
        const leaves = r.accounts.filter((a) => a.acceptsEntries && !a.deletedAt);
        setAccounts(leaves);
        setGlAccountId((prev) => prev || leaves[0]?.id || '');
      })
      .catch(() => {
        if (active) setAccounts([]);
      })
      .finally(() => {
        if (active) setLoadingAccounts(false);
      });
    return () => {
      active = false;
    };
  }, [unitId]);

  const accountLabel = useCallback(
    (id: string) => {
      const acc = accounts.find((a) => a.id === id);
      return acc ? `${acc.code} — ${acc.name}` : id;
    },
    [accounts],
  );

  const SUBTABS: Array<{ id: SubTab; labelKey: string; label: string }> = [
    { id: 'extratos', labelKey: 'reconciliation.subtabs.statements', label: 'Extratos' },
    { id: 'pendentes', labelKey: 'reconciliation.subtabs.pending', label: 'Fila pendente' },
  ];

  return (
    <div className="space-y-6">
      {/* Bank account selector + sub-tabs */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-1 rounded-xl border border-neutral-800 bg-neutral-900/50 p-1">
          {SUBTABS.map((st) => (
            <button
              key={st.id}
              type="button"
              onClick={() => setSub(st.id)}
              className={`rounded-lg px-4 py-1.5 text-sm font-medium transition-colors ${
                sub === st.id ? 'bg-neutral-800 text-emerald-400' : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              {t(st.labelKey, st.label)}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-2 text-sm">
          <span className="text-neutral-400">{t('reconciliation.bankAccount', 'Conta bancária')}</span>
          <select
            value={glAccountId}
            onChange={(e) => setGlAccountId(e.target.value)}
            disabled={loadingAccounts || accounts.length === 0}
            className={inputClass}
          >
            {loadingAccounts && <option value="">{t('reconciliation.loadingAccounts', 'Carregando contas…')}</option>}
            {!loadingAccounts && accounts.length === 0 && (
              <option value="">{t('reconciliation.noBankAccounts', 'Nenhuma conta disponível')}</option>
            )}
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.code} — {a.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {sub === 'extratos' && (
        <StatementsSubView
          unitId={unitId}
          glAccountId={glAccountId}
          accountLabel={accountLabel}
          onLedgerChange={onLedgerChange}
        />
      )}
      {sub === 'pendentes' && (
        <PendingSubView unitId={unitId} glAccountId={glAccountId} onLedgerChange={onLedgerChange} />
      )}
    </div>
  );
}
