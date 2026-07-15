import { useState } from 'react';
import { useTranslation } from 'next-i18next';
import {
  dimensionsService,
  type DimensionDefinition,
  type DimensionBalanceReport,
  type DimensionBalanceBucket,
  type DimensionResultReport,
  type DimensionResultBucket,
} from '../../../lib/services/dimensions.service';
import { formatCents } from '../lib/formatCents';

// ── error helper (apiClient throws a PLAIN OBJECT, not an Error) ────────────────
function resolveError(e: unknown, fallback: string): string {
  if (e && typeof e === 'object') {
    const o = e as { error?: unknown; message?: unknown };
    if (typeof o.message === 'string') return o.message;
    if (typeof o.error === 'string') return o.error;
  }
  return fallback;
}

/**
 * DFS-order a bucket list by the parentId tree, tagging depth for indentation. Buckets whose parent
 * is absent (or the null "(sem dimensão)" bucket) are roots; the null bucket is forced to the end so
 * "(sem dimensão)" always reads last. Cycle-safe via a visited set.
 */
function orderBuckets<B extends { valueId: string | null; parentId: string | null; valueCode: string | null }>(
  buckets: B[],
): Array<{ bucket: B; depth: number }> {
  const ids = new Set(buckets.map((b) => b.valueId).filter((v): v is string => v !== null));
  const byParent = new Map<string | null, B[]>();
  for (const b of buckets) {
    if (b.valueId === null) continue; // handled last
    const key = b.parentId && ids.has(b.parentId) ? b.parentId : null;
    const list = byParent.get(key) ?? [];
    list.push(b);
    byParent.set(key, list);
  }
  const out: Array<{ bucket: B; depth: number }> = [];
  const visited = new Set<string>();
  const walk = (parentId: string | null, depth: number) => {
    const kids = (byParent.get(parentId) ?? [])
      .slice()
      .sort((a, b) => (a.valueCode ?? '').localeCompare(b.valueCode ?? ''));
    for (const bucket of kids) {
      if (bucket.valueId && visited.has(bucket.valueId)) continue;
      if (bucket.valueId) visited.add(bucket.valueId);
      out.push({ bucket, depth });
      walk(bucket.valueId, depth + 1);
    }
  };
  walk(null, 0);
  const none = buckets.find((b) => b.valueId === null);
  if (none) out.push({ bucket: none, depth: 0 });
  return out;
}

interface Props {
  unitId: string;
  definitions: DimensionDefinition[];
}

type ReportKind = 'balance' | 'result';

/**
 * DimensionReports — the READ side of the Dimensões tab (INCR-DIM Fatia 3). Pick an axis + date range
 * and render either the balancete por dimensão (per-account, own vs rollup) or the DRE por dimensão.
 * Summing every bucket, including "(sem dimensão)", reproduces the trial balance / DRE (ACC-024).
 */
export function DimensionReports({ unitId, definitions }: Props) {
  const { t } = useTranslation('accounting');
  const [definitionId, setDefinitionId] = useState('');
  const [kind, setKind] = useState<ReportKind>('balance');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [balance, setBalance] = useState<DimensionBalanceReport | null>(null);
  const [result, setResult] = useState<DimensionResultReport | null>(null);

  async function generate() {
    if (!unitId || !definitionId) return;
    setLoading(true);
    setError(null);
    setBalance(null);
    setResult(null);
    try {
      const query = { unitId, definitionId, from: from || undefined, to: to || undefined };
      if (kind === 'balance') {
        setBalance(await dimensionsService.balanceByDimension(query));
      } else {
        setResult(await dimensionsService.resultByDimension(query));
      }
    } catch (err: unknown) {
      setError(resolveError(err, t('dimensions.reports.error', 'Erro ao gerar o relatório.')));
    } finally {
      setLoading(false);
    }
  }

  if (definitions.length === 0) {
    return (
      <div className="py-16 text-center text-neutral-500">
        {t('dimensions.reports.noAxes', 'Cadastre um eixo de dimensão ativo no catálogo para gerar relatórios.')}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Controls */}
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs font-semibold uppercase tracking-widest text-neutral-400">
            {t('dimensions.reports.axis', 'Eixo')}
          </span>
          <select
            value={definitionId}
            onChange={(e) => setDefinitionId(e.target.value)}
            className="rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2 text-neutral-100 focus:border-emerald-500 focus:outline-none"
          >
            <option value="">{t('dimensions.reports.selectAxis', '— selecione o eixo —')}</option>
            {definitions.map((d) => (
              <option key={d.id} value={d.id}>
                {d.code} — {d.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs font-semibold uppercase tracking-widest text-neutral-400">
            {t('dimensions.reports.from', 'De')}
          </span>
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2 text-neutral-100 focus:border-emerald-500 focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="text-xs font-semibold uppercase tracking-widest text-neutral-400">
            {t('dimensions.reports.to', 'Até')}
          </span>
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2 text-neutral-100 focus:border-emerald-500 focus:outline-none"
          />
        </label>

        <div className="inline-flex rounded-xl border border-neutral-800 bg-neutral-900/60 p-0.5">
          <button
            type="button"
            onClick={() => setKind('balance')}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              kind === 'balance' ? 'bg-neutral-800 text-emerald-400' : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            {t('dimensions.reports.balance', 'Balancete')}
          </button>
          <button
            type="button"
            onClick={() => setKind('result')}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              kind === 'result' ? 'bg-neutral-800 text-emerald-400' : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            {t('dimensions.reports.result', 'DRE')}
          </button>
        </div>

        <button
          type="button"
          onClick={() => void generate()}
          disabled={loading || !definitionId}
          className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-600 disabled:opacity-50"
        >
          {loading ? t('dimensions.reports.generating', 'Gerando…') : t('dimensions.reports.generate', 'Gerar')}
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-300">{error}</div>
      )}

      {!balance && !result && !loading && !error && (
        <div className="py-12 text-center text-neutral-500">
          {t('dimensions.reports.emptyState', 'Selecione um eixo e clique em "Gerar" para o recorte por dimensão.')}
        </div>
      )}

      {balance && <BalanceReport report={balance} />}
      {result && <ResultReport report={result} />}
    </div>
  );
}

// ── balancete por dimensão ───────────────────────────────────────────────────────
function BalanceReport({ report }: { report: DimensionBalanceReport }) {
  const { t } = useTranslation('accounting');
  const ordered = orderBuckets<DimensionBalanceBucket>(report.buckets);

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-neutral-300">
        {t('dimensions.reports.balanceTitle', 'Balancete por dimensão')}
        <span className="ml-2 font-normal text-neutral-500">
          {report.definitionCode} — {report.definitionName}
        </span>
      </h3>
      <div className="overflow-x-auto rounded-2xl border border-neutral-800 bg-neutral-900/50">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="border-b border-neutral-800 text-left text-neutral-400">
              <th className="px-4 py-3 font-medium">{t('dimensions.reports.col.value', 'Valor')}</th>
              <th className="px-4 py-3 text-right font-medium">{t('dimensions.reports.col.ownBalance', 'Saldo próprio')}</th>
              <th className="px-4 py-3 text-right font-medium">{t('dimensions.reports.col.rollupBalance', 'Saldo acumulado')}</th>
            </tr>
          </thead>
          <tbody>
            {ordered.map(({ bucket, depth }) => (
              <BalanceBucketRows key={bucket.valueId ?? '__none__'} bucket={bucket} depth={depth} />
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-neutral-700 bg-neutral-900/80">
              <td className="px-4 py-2.5 text-xs font-semibold text-neutral-400">{t('dimensions.reports.total', 'Total')}</td>
              <td className="px-4 py-2.5 text-right tabular-nums text-sm font-bold text-neutral-200" colSpan={2}>
                {formatCents(report.totals.balanceCents)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}

function BalanceBucketRows({ bucket, depth }: { bucket: DimensionBalanceBucket; depth: number }) {
  return (
    <>
      <tr className="border-b border-neutral-800/50">
        <td className="px-4 py-2 text-neutral-200">
          <span className="inline-flex items-center gap-1.5" style={{ paddingLeft: `${depth * 20}px` }}>
            {bucket.valueCode && <span className="font-mono text-xs text-neutral-500">{bucket.valueCode}</span>}
            <span className={bucket.valueId === null ? 'italic text-neutral-500' : ''}>{bucket.valueName}</span>
          </span>
        </td>
        <td className="px-4 py-2 text-right tabular-nums text-neutral-300">{formatCents(bucket.ownBalanceCents)}</td>
        <td className="px-4 py-2 text-right tabular-nums text-neutral-100">{formatCents(bucket.rollupBalanceCents)}</td>
      </tr>
      {/* Per-account breakdown of the bucket's OWN postings. */}
      {bucket.accounts.map((a) => (
        <tr key={`${bucket.valueId ?? '__none__'}-${a.accountId}`} className="border-b border-neutral-800/30 last:border-0">
          <td className="px-4 py-1.5 text-xs text-neutral-500">
            <span className="inline-block" style={{ paddingLeft: `${depth * 20 + 24}px` }}>
              <span className="font-mono">{a.code}</span> — {a.name}
            </span>
          </td>
          <td className="px-4 py-1.5 text-right text-xs tabular-nums text-neutral-500" colSpan={2}>
            {formatCents(a.balanceCents)}
          </td>
        </tr>
      ))}
    </>
  );
}

// ── DRE por dimensão ─────────────────────────────────────────────────────────────
function ResultReport({ report }: { report: DimensionResultReport }) {
  const { t } = useTranslation('accounting');
  const ordered = orderBuckets<DimensionResultBucket>(report.buckets);

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-neutral-300">
        {t('dimensions.reports.resultTitle', 'DRE por dimensão')}
        <span className="ml-2 font-normal text-neutral-500">
          {report.definitionCode} — {report.definitionName}
        </span>
      </h3>
      {ordered.length === 0 ? (
        <div className="py-10 text-center text-neutral-500">
          {t('dimensions.reports.noResult', 'Nenhum resultado (receita/despesa) etiquetado neste eixo no período.')}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-neutral-800 bg-neutral-900/50">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b border-neutral-800 text-left text-neutral-400">
                <th className="px-4 py-3 font-medium">{t('dimensions.reports.col.value', 'Valor')}</th>
                <th className="px-4 py-3 text-right font-medium">{t('dimensions.reports.col.revenue', 'Receita')}</th>
                <th className="px-4 py-3 text-right font-medium">{t('dimensions.reports.col.expense', 'Despesa')}</th>
                <th className="px-4 py-3 text-right font-medium">{t('dimensions.reports.col.result', 'Resultado')}</th>
              </tr>
            </thead>
            <tbody>
              {ordered.map(({ bucket, depth }) => {
                const res = bucket.rollupResultCents;
                return (
                  <tr key={bucket.valueId ?? '__none__'} className="border-b border-neutral-800/50 last:border-0">
                    <td className="px-4 py-2 text-neutral-200">
                      <span className="inline-flex items-center gap-1.5" style={{ paddingLeft: `${depth * 20}px` }}>
                        {bucket.valueCode && <span className="font-mono text-xs text-neutral-500">{bucket.valueCode}</span>}
                        <span className={bucket.valueId === null ? 'italic text-neutral-500' : ''}>{bucket.valueName}</span>
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums text-neutral-300">{formatCents(bucket.rollupRevenueCents)}</td>
                    <td className="px-4 py-2 text-right tabular-nums text-neutral-300">{formatCents(bucket.rollupExpenseCents)}</td>
                    <td className={`px-4 py-2 text-right tabular-nums font-medium ${res >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                      {formatCents(res)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t border-neutral-700 bg-neutral-900/80">
                <td className="px-4 py-2.5 text-xs font-semibold text-neutral-400">{t('dimensions.reports.total', 'Total')}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-neutral-200">{formatCents(report.totals.revenueCents)}</td>
                <td className="px-4 py-2.5 text-right tabular-nums text-neutral-200">{formatCents(report.totals.expenseCents)}</td>
                <td className={`px-4 py-2.5 text-right tabular-nums font-bold ${report.totals.resultCents >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {formatCents(report.totals.resultCents)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
