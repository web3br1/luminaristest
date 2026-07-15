import { useState } from 'react';
import { useTranslation } from 'next-i18next';
import { FiBookOpen, FiCheckCircle, FiAlertTriangle, FiPlusCircle } from 'react-icons/fi';
import { useAccountingData } from './hooks/useAccountingData';
import { TrialBalanceTable } from './components/TrialBalanceTable';
import { JournalEntriesPanel } from './components/JournalEntriesPanel';
import { ChartOfAccountsPanel } from './components/ChartOfAccountsPanel';
import { PeriodsPanel } from './components/PeriodsPanel';
import { LedgerPanel } from './components/LedgerPanel';
import { BalanceSheetPanel } from './components/BalanceSheetPanel';
import { IncomeStatementPanel } from './components/IncomeStatementPanel';
import { ImportExportPanel } from './components/ImportExportPanel';
import { ReconciliationPanel } from './components/ReconciliationPanel';
import { CompliancePanel } from './components/CompliancePanel';
import { SpedGenerationPanel } from './components/SpedGenerationPanel';
import { DFCPanel } from './components/DFCPanel';
import { PeriodComparisonPanel } from './components/PeriodComparisonPanel';
import { DailyJournalPanel } from './components/DailyJournalPanel';
import { AccountsPayablePanel } from './components/AccountsPayablePanel';
import { AccountsReceivablePanel } from './components/AccountsReceivablePanel';
import { DimensionsPanel } from './components/DimensionsPanel';
import { JournalEntryModal, type AccountOption } from './components/JournalEntryModal';
import { accountingService } from '../../lib/services/accounting.service';
import { dimensionsService, type DimensionCatalogEntry } from '../../lib/services/dimensions.service';

type Tab = 'balancete' | 'periodos' | 'lancamentos' | 'contas-a-pagar' | 'contas-a-receber' | 'razao' | 'plano-de-contas' | 'bp' | 'dre' | 'dfc' | 'comparativo' | 'diario' | 'importacao-exportacao' | 'conciliacao' | 'compliance' | 'dimensoes';

// label = i18n fallback (current pt-BR); rendered via t(`view.tabs.<id>`, label)
const TABS: Array<{ id: Tab; labelKey: string; label: string }> = [
  { id: 'balancete',      labelKey: 'view.tabs.balancete',      label: 'Balancete' },
  { id: 'periodos',       labelKey: 'view.tabs.periodos',       label: 'Períodos' },
  { id: 'lancamentos',    labelKey: 'view.tabs.lancamentos',    label: 'Lançamentos' },
  { id: 'contas-a-pagar', labelKey: 'view.tabs.contasAPagar',   label: 'Contas a Pagar' },
  { id: 'contas-a-receber', labelKey: 'view.tabs.contasAReceber', label: 'Contas a Receber' },
  { id: 'razao',          labelKey: 'view.tabs.razao',          label: 'Razão' },
  { id: 'plano-de-contas',labelKey: 'view.tabs.planoDeContas',  label: 'Plano de Contas' },
  { id: 'bp',             labelKey: 'view.tabs.bp',             label: 'BP' },
  { id: 'dre',            labelKey: 'view.tabs.dre',            label: 'DRE' },
  { id: 'dfc',            labelKey: 'view.tabs.dfc',            label: 'DFC' },
  { id: 'comparativo',    labelKey: 'view.tabs.comparativo',    label: 'Comparativo' },
  { id: 'diario',         labelKey: 'view.tabs.diario',         label: 'Livro Diário' },
  { id: 'importacao-exportacao', labelKey: 'view.tabs.importacaoExportacao', label: 'Importação/Exportação' },
  { id: 'conciliacao',    labelKey: 'view.tabs.conciliacao',    label: 'Conciliação' },
  { id: 'compliance',     labelKey: 'view.tabs.compliance',     label: 'Compliance' },
  { id: 'dimensoes',      labelKey: 'view.tabs.dimensoes',      label: 'Dimensões' },
];

/**
 * Accounting workspace — first-class Prisma double-entry module. Picks a business
 * unit (the second tenancy axis) and shows its trial balance (balancete), journal
 * entries, and chart of accounts as tabs.
 */
export function AccountingView() {
  const { t } = useTranslation('accounting');
  const { units, unitId, setUnitId, report, loadingUnits, loadingReport, error, reload } =
    useAccountingData();

  const [activeTab, setActiveTab] = useState<Tab>('balancete');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [modalAccounts, setModalAccounts] = useState<AccountOption[]>([]);
  const [modalDimensionCatalog, setModalDimensionCatalog] = useState<DimensionCatalogEntry[]>([]);

  function openNewEntryModal() {
    if (!unitId) return;
    // Fetch accounts (required) and the dimension catalog (best-effort, for optional per-line tagging).
    accountingService
      .getAccounts(unitId)
      .then((r) => {
        setModalAccounts(r.accounts.filter((a) => a.acceptsEntries));
        setIsModalOpen(true);
      })
      .catch(() => {
        // Still open the modal; it will show an empty account list
        setModalAccounts([]);
        setIsModalOpen(true);
      });
    dimensionsService
      .listCatalog({ unitId })
      .then(setModalDimensionCatalog)
      .catch(() => setModalDimensionCatalog([]));
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <header className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="inline-flex items-center justify-center rounded-2xl bg-emerald-600/15 p-3 text-emerald-400">
            <FiBookOpen size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-neutral-100">{t('view.title', 'Contabilidade')}</h1>
            <p className="text-sm text-neutral-500">{t('view.subtitle', 'Razão de partida dobrada — balancete por unidade')}</p>
          </div>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <span className="text-neutral-400">{t('view.unit', 'Unidade')}</span>
          <select
            value={unitId}
            onChange={(e) => setUnitId(e.target.value)}
            disabled={loadingUnits || units.length === 0}
            className="rounded-xl border border-neutral-700 bg-neutral-900 px-3 py-2 text-neutral-100 focus:border-emerald-500 focus:outline-none disabled:opacity-50"
          >
            {loadingUnits && <option>{t('view.loadingUnits', 'Carregando…')}</option>}
            {!loadingUnits && units.length === 0 && <option value="">{t('view.noUnit', 'Nenhuma unidade')}</option>}
            {units.map((u) => (
              <option key={u.id} value={u.id}>
                {u.label}
              </option>
            ))}
          </select>
        </label>
      </header>

      {/* ── Tab bar ────────────────────────────────────────────────────────── */}
      <div className="mb-6 flex items-center gap-1 border-b border-neutral-800">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={`relative px-4 py-2.5 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'text-emerald-400'
                : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            {t(tab.labelKey, tab.label)}
            {activeTab === tab.id && (
              <span className="absolute inset-x-0 bottom-0 h-0.5 rounded-full bg-emerald-400" />
            )}
          </button>
        ))}
      </div>

      {/* ── No unit selected ───────────────────────────────────────────────── */}
      {!unitId && !loadingUnits && (
        <div className="py-16 text-center text-neutral-500">
          {t('view.selectUnitPrompt', 'Selecione uma unidade para visualizar os dados contábeis.')}
        </div>
      )}

      {/* ── Error banner ───────────────────────────────────────────────────── */}
      {error && (
        <div className="mb-4 rounded-xl border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* ── Balancete tab ──────────────────────────────────────────────────── */}
      {activeTab === 'balancete' && unitId && (
        <>
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h2 className="text-lg font-semibold text-neutral-200">{t('view.balancete', 'Balancete')}</h2>
              {report && !loadingReport && (
                report.balanced ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-600/15 px-3 py-1 text-xs font-medium text-emerald-400">
                    <FiCheckCircle size={14} /> {t('view.balanced', 'Balanceado (Σdébito = Σcrédito)')}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-red-600/15 px-3 py-1 text-xs font-medium text-red-400">
                    <FiAlertTriangle size={14} /> {t('view.unbalanced', 'Desbalanceado — verifique o razão')}
                  </span>
                )
              )}
            </div>

            <button
              type="button"
              onClick={openNewEntryModal}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 active:bg-emerald-700"
            >
              <FiPlusCircle size={16} />
              {t('view.newEntry', 'Novo Lançamento')}
            </button>
          </div>

          <TrialBalanceTable report={report} loading={loadingReport} />
        </>
      )}

      {/* ── Períodos tab ───────────────────────────────────────────────────── */}
      {activeTab === 'periodos' && unitId && (
        <PeriodsPanel unitId={unitId} />
      )}

      {/* ── Lançamentos tab ────────────────────────────────────────────────── */}
      {activeTab === 'lancamentos' && unitId && (
        <JournalEntriesPanel unitId={unitId} onReversalComplete={reload} onNavigateToPeriods={() => setActiveTab('periodos')} />
      )}

      {/* ── Contas a Pagar tab ─────────────────────────────────────────────── */}
      {activeTab === 'contas-a-pagar' && unitId && (
        <AccountsPayablePanel unitId={unitId} onLedgerChange={reload} onNavigateToPeriods={() => setActiveTab('periodos')} />
      )}

      {/* ── Contas a Receber tab ───────────────────────────────────────────── */}
      {activeTab === 'contas-a-receber' && unitId && (
        <AccountsReceivablePanel unitId={unitId} onLedgerChange={reload} onNavigateToPeriods={() => setActiveTab('periodos')} />
      )}

      {/* ── Razão tab ──────────────────────────────────────────────────────── */}
      {activeTab === 'razao' && unitId && (
        <LedgerPanel unitId={unitId} />
      )}

      {/* ── Plano de Contas tab ────────────────────────────────────────────── */}
      {activeTab === 'plano-de-contas' && unitId && (
        <ChartOfAccountsPanel unitId={unitId} canManage={true} />
      )}

      {/* ── BP tab ─────────────────────────────────────────────────────────── */}
      {activeTab === 'bp' && unitId && (
        <BalanceSheetPanel unitId={unitId} />
      )}

      {/* ── DRE tab ────────────────────────────────────────────────────────── */}
      {activeTab === 'dre' && unitId && (
        <IncomeStatementPanel unitId={unitId} />
      )}

      {/* ── DFC (fluxo de caixa) tab ───────────────────────────────────────── */}
      {activeTab === 'dfc' && unitId && (
        <DFCPanel unitId={unitId} />
      )}

      {/* ── Balancete comparativo tab ──────────────────────────────────────── */}
      {activeTab === 'comparativo' && unitId && (
        <PeriodComparisonPanel unitId={unitId} />
      )}

      {/* ── Livro Diário tab ───────────────────────────────────────────────── */}
      {activeTab === 'diario' && unitId && (
        <DailyJournalPanel unitId={unitId} />
      )}

      {/* ── Importação/Exportação tab ──────────────────────────────────────── */}
      {activeTab === 'importacao-exportacao' && unitId && (
        <ImportExportPanel unitId={unitId} onCommitSuccess={reload} />
      )}

      {/* ── Conciliação bancária tab ───────────────────────────────────────── */}
      {activeTab === 'conciliacao' && unitId && (
        <ReconciliationPanel unitId={unitId} onLedgerChange={reload} />
      )}

      {/* ── Compliance (mapeamento referencial RFB + geração SPED) tab ─────── */}
      {activeTab === 'compliance' && unitId && (
        <div className="space-y-8">
          <CompliancePanel unitId={unitId} />
          <SpedGenerationPanel unitId={unitId} />
        </div>
      )}

      {/* ── Dimensões (centro de custo / projeto) tab ──────────────────────── */}
      {activeTab === 'dimensoes' && unitId && (
        <DimensionsPanel unitId={unitId} />
      )}

      {/* ── New Entry Modal ────────────────────────────────────────────────── */}
      <JournalEntryModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        unitId={unitId}
        accounts={modalAccounts}
        dimensionCatalog={modalDimensionCatalog}
        onSuccess={() => {
          setIsModalOpen(false);
          void reload();
        }}
      />
    </div>
  );
}
