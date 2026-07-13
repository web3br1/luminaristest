// React default import: tsconfig uses jsx:"preserve", so vitest/esbuild transforms JSX with the
// classic runtime and needs React in scope (same pattern as ImportExportPanel, the tested precedent).
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'next-i18next';
import { FiCheckCircle, FiAlertTriangle, FiRefreshCw, FiSave, FiCopy } from 'react-icons/fi';
import {
  referentialService,
  type ReferentialCoverageReport,
  type ReferentialMappingItem,
  type UnmappedReferentialAccount,
} from '../../../lib/services/referential.service';

const inputClass =
  'rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2 text-sm text-neutral-100 focus:border-emerald-500 focus:outline-none disabled:opacity-50';

/** Draft edits keyed by accountId: what the owner typed for each unmapped account. */
export type MappingDraft = Record<string, { referentialCode: string; label: string }>;

function resolveError(e: unknown, fallback: string): string {
  if (e && typeof e === 'object') {
    const o = e as { error?: unknown; message?: unknown };
    if (typeof o.error === 'string') return o.error;
    if (typeof o.message === 'string') return o.message;
  }
  return fallback;
}

/**
 * Pure: turn the owner's drafts into a batch payload. Only rows with a non-blank
 * referentialCode are sent; a blank label falls back to the account name (the RFB
 * de-para needs a label, and the account's own name is the sensible default). Codes
 * and labels are trimmed. Accounts the owner left untouched are omitted — a batch is
 * an upsert, so omitting is a no-op, not a delete.
 */
export function buildBatchItems(
  drafts: MappingDraft,
  accounts: UnmappedReferentialAccount[],
): ReferentialMappingItem[] {
  const items: ReferentialMappingItem[] = [];
  for (const acc of accounts) {
    const draft = drafts[acc.accountId];
    const code = draft?.referentialCode?.trim();
    if (!code) continue;
    const label = draft?.label?.trim() || acc.name;
    items.push({ accountId: acc.accountId, referentialCode: code, label });
  }
  return items;
}

/**
 * Compliance panel — owner-facing authoring of the RFB referential mapping
 * (BE-INCR-9 / 9B). The owner picks a mapping version, sees which leaf accounts
 * still lack an RFB code (the coverage gate that blocks SPED ECD generation), fills
 * them in, and saves a batch. A version can also be cloned for a new fiscal year.
 *
 * Generation of the ECD/ECF file itself (declarant/book/signers forms) lands in a
 * follow-up increment (A1b) — this panel delivers the prerequisite: a "ready" mapping.
 */
export function CompliancePanel({ unitId }: { unitId: string }) {
  const { t } = useTranslation('accounting');
  const genericError = () => t('compliance.error.generic', 'Ocorreu um erro. Tente novamente.');

  const [version, setVersion] = useState('');
  const [loadedVersion, setLoadedVersion] = useState<string | null>(null);
  const [coverage, setCoverage] = useState<ReferentialCoverageReport | null>(null);
  const [drafts, setDrafts] = useState<MappingDraft>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Copy-version state
  const [copyTo, setCopyTo] = useState('');
  const [copying, setCopying] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);

  const loadCoverage = useCallback(
    async (v: string) => {
      const trimmed = v.trim();
      if (!trimmed) {
        setError(t('compliance.error.versionRequired', 'Informe uma versão de mapeamento.'));
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const report = await referentialService.getCoverage(unitId, trimmed);
        setCoverage(report);
        setLoadedVersion(trimmed);
        setDrafts({});
      } catch (err) {
        setError(resolveError(err, genericError()));
        setCoverage(null);
        setLoadedVersion(null);
      } finally {
        setLoading(false);
      }
    },
    [unitId], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Reset when the unit changes (unitId is the second tenancy axis).
  useEffect(() => {
    setCoverage(null);
    setLoadedVersion(null);
    setDrafts({});
    setError(null);
  }, [unitId]);

  function setDraft(accountId: string, field: 'referentialCode' | 'label', value: string) {
    setDrafts((prev) => {
      const current = prev[accountId] ?? { referentialCode: '', label: '' };
      return { ...prev, [accountId]: { ...current, [field]: value } };
    });
  }

  const pendingItems =
    coverage && loadedVersion ? buildBatchItems(drafts, coverage.unmappedAccounts) : [];

  async function handleSave() {
    if (!coverage || !loadedVersion || pendingItems.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      await referentialService.batchSet(unitId, loadedVersion, pendingItems);
      await loadCoverage(loadedVersion); // refetch → unmapped list shrinks, ready flag updates
    } catch (err) {
      setError(resolveError(err, genericError()));
    } finally {
      setSaving(false);
    }
  }

  async function handleCopy() {
    setCopyError(null);
    const from = loadedVersion;
    const to = copyTo.trim();
    if (!from) {
      setCopyError(t('compliance.error.loadFirst', 'Carregue uma versão de origem primeiro.'));
      return;
    }
    if (!to || to === from) {
      setCopyError(t('compliance.error.copyTarget', 'Informe uma versão de destino diferente.'));
      return;
    }
    setCopying(true);
    try {
      await referentialService.copyVersion(unitId, from, to);
      setVersion(to);
      setCopyTo('');
      await loadCoverage(to);
    } catch (err) {
      setCopyError(resolveError(err, genericError()));
    } finally {
      setCopying(false);
    }
  }

  return (
    <div className="space-y-8">
      {/* ── Mapeamento Referencial (RFB) ─────────────────────────────────────── */}
      <section className="rounded-2xl border border-neutral-800 bg-neutral-900/50 p-5">
        <h2 className="mb-1 text-lg font-semibold text-neutral-200">
          {t('compliance.mapping.title', 'Mapeamento Referencial (RFB)')}
        </h2>
        <p className="mb-4 text-sm text-neutral-500">
          {t(
            'compliance.mapping.description',
            'Associe cada conta analítica ao código do plano referencial da Receita. Todas as contas precisam de código antes de gerar a ECD.',
          )}
        </p>

        <div className="flex flex-wrap items-end gap-3">
          <label className="flex items-center gap-2 text-sm text-neutral-400">
            {t('compliance.mapping.versionLabel', 'Versão')}
            <input
              type="text"
              value={version}
              onChange={(e) => setVersion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void loadCoverage(version);
              }}
              placeholder="2026"
              className={inputClass}
            />
          </label>
          <button
            type="button"
            onClick={() => void loadCoverage(version)}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 active:bg-emerald-700 disabled:opacity-50"
          >
            {loading ? <FiRefreshCw className="animate-spin" size={16} /> : <FiCheckCircle size={16} />}
            {loading
              ? t('compliance.mapping.loading', 'Carregando…')
              : t('compliance.mapping.load', 'Carregar cobertura')}
          </button>
        </div>

        {error && (
          <div className="mt-4 rounded-xl border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-300">
            {error}
          </div>
        )}

        {coverage && loadedVersion && (
          <div className="mt-5">
            {/* Readiness + totals */}
            <div className="mb-4 flex flex-wrap items-center gap-3 text-sm">
              {coverage.ready ? (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600/15 px-3 py-1 text-xs font-medium text-emerald-400">
                  <FiCheckCircle size={13} />
                  {t('compliance.mapping.ready', 'Pronto para gerar ECD/ECF')}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-600/15 px-3 py-1 text-xs font-medium text-amber-400">
                  <FiAlertTriangle size={13} />
                  {t('compliance.mapping.notReady', '{{count}} conta(s) sem mapeamento', {
                    count: coverage.totals.unmappedCount,
                  })}
                </span>
              )}
              <span className="text-neutral-400">
                {t('compliance.mapping.stats.leaf', 'Analíticas:')}{' '}
                <strong className="text-neutral-200">{coverage.totals.leafAccountCount}</strong>
              </span>
              <span className="text-emerald-400">
                {t('compliance.mapping.stats.mapped', 'Mapeadas:')} <strong>{coverage.totals.mappedCount}</strong>
              </span>
              <span className="text-amber-400">
                {t('compliance.mapping.stats.unmapped', 'Pendentes:')}{' '}
                <strong>{coverage.totals.unmappedCount}</strong>
              </span>
            </div>

            {coverage.unmappedAccounts.length > 0 ? (
              <>
                <div className="overflow-hidden rounded-2xl border border-neutral-800">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-neutral-900 text-xs uppercase text-neutral-500">
                      <tr>
                        <th className="px-3 py-2">{t('compliance.mapping.table.account', 'Conta')}</th>
                        <th className="px-3 py-2">{t('compliance.mapping.table.code', 'Código RFB')}</th>
                        <th className="px-3 py-2">{t('compliance.mapping.table.label', 'Rótulo')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-800">
                      {coverage.unmappedAccounts.map((acc) => (
                        <tr key={acc.accountId} className="text-neutral-300">
                          <td className="px-3 py-2">
                            <span className="font-mono text-xs text-neutral-400">{acc.code}</span>{' '}
                            <span className="text-neutral-200">{acc.name}</span>
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="text"
                              value={drafts[acc.accountId]?.referentialCode ?? ''}
                              onChange={(e) => setDraft(acc.accountId, 'referentialCode', e.target.value)}
                              placeholder="1.01.01.01"
                              className={`${inputClass} w-36`}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="text"
                              value={drafts[acc.accountId]?.label ?? ''}
                              onChange={(e) => setDraft(acc.accountId, 'label', e.target.value)}
                              placeholder={acc.name}
                              className={`${inputClass} w-full`}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving || pendingItems.length === 0}
                  className="mt-4 inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 active:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {saving ? <FiRefreshCw className="animate-spin" size={16} /> : <FiSave size={16} />}
                  {saving
                    ? t('compliance.mapping.saving', 'Salvando…')
                    : t('compliance.mapping.save', 'Salvar mapeamentos ({{count}})', {
                        count: pendingItems.length,
                      })}
                </button>
              </>
            ) : (
              <div className="rounded-xl border border-emerald-900/50 bg-emerald-950/20 px-4 py-3 text-sm text-emerald-300">
                {t('compliance.mapping.allMapped', 'Todas as contas analíticas estão mapeadas nesta versão.')}
              </div>
            )}
          </div>
        )}
      </section>

      {/* ── Copiar versão (rollover de exercício) ────────────────────────────── */}
      {coverage && loadedVersion && (
        <section className="rounded-2xl border border-neutral-800 bg-neutral-900/50 p-5">
          <h2 className="mb-1 text-lg font-semibold text-neutral-200">
            {t('compliance.copy.title', 'Copiar versão')}
          </h2>
          <p className="mb-4 text-sm text-neutral-500">
            {t(
              'compliance.copy.description',
              'Clone o mapeamento da versão carregada ({{from}}) para uma nova versão — útil na virada de exercício.',
              { from: loadedVersion },
            )}
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex items-center gap-2 text-sm text-neutral-400">
              {t('compliance.copy.toLabel', 'Nova versão')}
              <input
                type="text"
                value={copyTo}
                onChange={(e) => setCopyTo(e.target.value)}
                placeholder="2027"
                className={inputClass}
              />
            </label>
            <button
              type="button"
              onClick={handleCopy}
              disabled={copying}
              className="inline-flex items-center gap-2 rounded-xl border border-neutral-700 bg-neutral-800 px-4 py-2 text-sm font-medium text-neutral-200 transition-colors hover:bg-neutral-700 disabled:opacity-50"
            >
              {copying ? <FiRefreshCw className="animate-spin" size={16} /> : <FiCopy size={16} />}
              {copying ? t('compliance.copy.copying', 'Copiando…') : t('compliance.copy.submit', 'Copiar')}
            </button>
          </div>
          {copyError && (
            <div className="mt-4 rounded-xl border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-300">
              {copyError}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
