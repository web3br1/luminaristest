import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'next-i18next';
import { accountingService, type AccountingPeriod, type PeriodStatus } from '../../../lib/services/accounting.service';

// Fallback pt-BR labels; rendered via t(`periods.months.<n>`) / t(`periods.status.<status>`)
const MONTHS = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];

const STATUS_CHIP: Record<PeriodStatus, { label: string; className: string }> = {
  FUTURE:      { label: 'Futuro',     className: 'bg-neutral-700/60 text-neutral-400' },
  OPEN:        { label: 'Aberto',     className: 'bg-emerald-900/40 text-emerald-300' },
  SOFT_CLOSED: { label: 'Fech. Parcial', className: 'bg-amber-900/40 text-amber-300' },
  HARD_CLOSED: { label: 'Definitivo', className: 'bg-red-900/40 text-red-300' },
};

interface Props {
  unitId: string;
}

export function PeriodsPanel({ unitId }: Props) {
  const { t } = useTranslation('accounting');
  const [year, setYear] = useState(new Date().getFullYear());
  const [periods, setPeriods] = useState<AccountingPeriod[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reasonInput, setReasonInput] = useState<{ periodId: string; action: string; value: string } | null>(null);
  const [acting, setActing] = useState(false);

  const load = useCallback(async () => {
    if (!unitId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await accountingService.listPeriods(unitId, year);
      setPeriods(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('periods.error.load', 'Erro ao carregar períodos.'));
    } finally {
      setLoading(false);
    }
  }, [unitId, year]);

  useEffect(() => { void load(); }, [load]);

  async function handleSeedYear() {
    setActing(true);
    setError(null);
    try {
      await accountingService.seedYear(unitId, year);
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('periods.error.seed', 'Erro ao semear períodos.'));
    } finally {
      setActing(false);
    }
  }

  async function handleAction(period: AccountingPeriod, action: string, reason?: string) {
    setActing(true);
    setError(null);
    try {
      if (action === 'open')       await accountingService.openPeriod(period.id, unitId);
      if (action === 'soft-close') await accountingService.softClosePeriod(period.id, unitId, reason);
      if (action === 'hard-close') await accountingService.hardClosePeriod(period.id, unitId, reason);
      if (action === 'reopen')     await accountingService.reopenPeriod(period.id, unitId, reason);
      setReasonInput(null);
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : t('periods.error.transition', 'Erro na transição de período.'));
    } finally {
      setActing(false);
    }
  }

  const byMonth = new Map(periods.map((p) => [p.month, p]));
  const hasPeriods = periods.length > 0;

  return (
    <div className="space-y-5">
      {/* Year picker + seed */}
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          <span className="text-neutral-400">{t('periods.fiscalYear', 'Exercício')}</span>
          <select
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            className="rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2 text-neutral-100 focus:border-emerald-500 focus:outline-none"
          >
            {[year - 1, year, year + 1].map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </label>

        {!loading && !hasPeriods && (
          <button
            type="button"
            onClick={() => void handleSeedYear()}
            disabled={acting}
            className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-600 disabled:opacity-50"
          >
            {acting ? t('periods.seeding', 'Criando…') : t('periods.seedYear', 'Semear {{year}}', { year })}
          </button>
        )}
      </div>

      {error && (
        <div className="rounded-xl border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {loading && (
        <div className="py-12 text-center text-neutral-400">{t('periods.loading', 'Carregando períodos…')}</div>
      )}

      {!loading && !hasPeriods && !error && (
        <div className="py-12 text-center text-neutral-500">
          {t('periods.emptyYear', 'Nenhum período criado para {{year}}. Clique em "Semear {{year}}" para inicializar.', { year })}
        </div>
      )}

      {!loading && hasPeriods && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
          {MONTHS.map((label, idx) => {
            const month = idx + 1;
            const period = byMonth.get(month);
            const status = period?.status ?? 'FUTURE';
            const chip = STATUS_CHIP[status];

            return (
              <div key={month} className="rounded-2xl border border-neutral-800 bg-neutral-900/60 p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-neutral-200">{t('periods.months.' + month, label)}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${chip.className}`}>
                    {t('periods.status.' + status, chip.label)}
                  </span>
                </div>

                {period && status !== 'HARD_CLOSED' && (
                  <div className="flex flex-col gap-1.5">
                    {status === 'FUTURE' && (
                      <ActionButton label={t('periods.action.open', 'Abrir')} color="emerald" disabled={acting}
                        onClick={() => void handleAction(period, 'open')} />
                    )}
                    {status === 'OPEN' && (
                      <>
                        <ActionButton label={t('periods.action.softClose', 'Fechar parcial')} color="amber" disabled={acting}
                          onClick={() => setReasonInput({ periodId: period.id, action: 'soft-close', value: '' })} />
                        <ActionButton label={t('periods.action.hardClose', 'Fechar definitivo')} color="red" disabled={acting}
                          onClick={() => setReasonInput({ periodId: period.id, action: 'hard-close', value: '' })} />
                      </>
                    )}
                    {status === 'SOFT_CLOSED' && (
                      <>
                        <ActionButton label={t('periods.action.reopen', 'Reabrir')} color="emerald" disabled={acting}
                          onClick={() => setReasonInput({ periodId: period.id, action: 'reopen', value: '' })} />
                        <ActionButton label={t('periods.action.hardClose', 'Fechar definitivo')} color="red" disabled={acting}
                          onClick={() => setReasonInput({ periodId: period.id, action: 'hard-close', value: '' })} />
                      </>
                    )}
                  </div>
                )}
                {period && status === 'HARD_CLOSED' && (
                  <p className="text-xs text-neutral-600">{t('periods.hardClosed', 'Definitivamente fechado')}</p>
                )}
                {!period && (
                  <p className="text-xs text-neutral-600">{t('periods.notCreated', 'Não criado')}</p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Inline reason input */}
      {reasonInput && (
        <div className="rounded-2xl border border-neutral-700 bg-neutral-900/80 p-4 space-y-3">
          <p className="text-sm font-medium text-neutral-200">
            {`${t('periods.actionLabel.' + reasonInput.action, ACTION_LABEL[reasonInput.action])} — ${t('periods.reasonOptional', 'motivo (opcional)')}`}
          </p>
          <input
            type="text"
            value={reasonInput.value}
            onChange={(e) => setReasonInput((r) => r ? { ...r, value: e.target.value } : r)}
            placeholder={t('periods.reasonPlaceholder', 'Justificativa…')}
            className="w-full rounded-xl border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-600 focus:border-emerald-500 focus:outline-none"
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={acting}
              onClick={() => {
                const period = periods.find((p) => p.id === reasonInput.periodId);
                if (period) void handleAction(period, reasonInput.action, reasonInput.value || undefined);
              }}
              className="rounded-xl bg-emerald-700 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-600 disabled:opacity-50"
            >
              {acting ? t('periods.wait', 'Aguarde…') : t('periods.confirm', 'Confirmar')}
            </button>
            <button
              type="button"
              disabled={acting}
              onClick={() => setReasonInput(null)}
              className="rounded-xl border border-neutral-700 bg-neutral-800 px-4 py-2 text-sm font-medium text-neutral-300 hover:bg-neutral-700"
            >
              {t('periods.cancel', 'Cancelar')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const ACTION_LABEL: Record<string, string> = {
  'soft-close': 'Fechar parcialmente',
  'hard-close': 'Fechar definitivamente',
  'reopen': 'Reabrir período',
};

function ActionButton({ label, color, disabled, onClick }: {
  label: string;
  color: 'emerald' | 'amber' | 'red';
  disabled: boolean;
  onClick: () => void;
}) {
  const cls = {
    emerald: 'border-emerald-800/60 text-emerald-400 hover:bg-emerald-900/30',
    amber:   'border-amber-800/60 text-amber-400 hover:bg-amber-900/30',
    red:     'border-red-800/60 text-red-400 hover:bg-red-900/30',
  }[color];
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded-xl border px-2 py-1 text-xs font-medium transition-colors disabled:opacity-40 ${cls}`}
    >
      {label}
    </button>
  );
}
