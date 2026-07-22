import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'next-i18next';
import { FiPlusCircle, FiArchive } from 'react-icons/fi';
import {
  counterpartiesService,
  type Counterparty,
  type CounterpartyType,
} from '../../../lib/services/counterparties.service';
import { Modal } from '../../../components/ui/Modal';
import { CreateCounterpartyModal } from './CreateCounterpartyModal';
import { resolveError } from '../lib/resolveError';


// ── type badge ─────────────────────────────────────────────────────────────
const TYPE_CLASS: Record<CounterpartyType, string> = {
  SUPPLIER: 'bg-blue-900/40 text-blue-300',
  CUSTOMER: 'bg-emerald-900/40 text-emerald-300',
};

function TypeBadge({ type }: { type: CounterpartyType }) {
  const { t } = useTranslation('accounting');
  const label = type === 'SUPPLIER'
    ? t('contrapartes.type.SUPPLIER', 'Fornecedor')
    : t('contrapartes.type.CUSTOMER', 'Cliente');
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${TYPE_CLASS[type]}`}>
      {label}
    </span>
  );
}

type TypeFilter = 'ALL' | CounterpartyType;

interface CounterpartiesPanelProps {
  unitId: string;
}

/**
 * CounterpartiesPanel — catálogo de contrapartes (fornecedores/clientes) de uma unidade.
 * Lista + cadastrar + arquivar. Uma contraparte é identidade estável que o subledger de
 * AP/AR referencia por FK; não posta no razão.
 */
export function CounterpartiesPanel({ unitId }: CounterpartiesPanelProps) {
  const { t } = useTranslation('accounting');
  const [counterparties, setCounterparties] = useState<Counterparty[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [typeFilter, setTypeFilter] = useState<TypeFilter>('ALL');
  const [includeArchived, setIncludeArchived] = useState(false);

  const [isCreateOpen, setIsCreateOpen] = useState(false);

  // archive confirmation modal
  const [toArchive, setToArchive] = useState<Counterparty | null>(null);
  const [busy, setBusy] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);

  const fetchCounterparties = useCallback(async () => {
    if (!unitId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await counterpartiesService.listCounterparties({
        unitId,
        type: typeFilter === 'ALL' ? undefined : typeFilter,
        includeArchived,
      });
      setCounterparties(data);
    } catch (err: unknown) {
      setError(resolveError(err, t('contrapartes.error.load', 'Erro ao carregar as contrapartes.')));
    } finally {
      setLoading(false);
    }
  }, [unitId, typeFilter, includeArchived, t]);

  useEffect(() => {
    void fetchCounterparties();
  }, [fetchCounterparties]);

  async function runArchive() {
    if (!toArchive) return;
    setBusy(true);
    setArchiveError(null);
    try {
      await counterpartiesService.archiveCounterparty(toArchive.id, unitId);
      setToArchive(null);
      await fetchCounterparties();
    } catch (err: unknown) {
      setArchiveError(resolveError(err, t('contrapartes.error.archive', 'Não foi possível arquivar a contraparte.')));
    } finally {
      setBusy(false);
    }
  }

  const filterBtn = (value: TypeFilter, label: string) => (
    <button
      type="button"
      onClick={() => setTypeFilter(value)}
      className={`rounded-xl px-3 py-1.5 text-xs font-medium transition-colors ${
        typeFilter === value
          ? 'bg-emerald-600 text-white'
          : 'border border-neutral-700 bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-4">
      {/* Header row: title + new button */}
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-neutral-200">{t('contrapartes.heading', 'Contrapartes')}</h2>
        <button
          type="button"
          onClick={() => setIsCreateOpen(true)}
          className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 active:bg-emerald-700"
        >
          <FiPlusCircle size={16} />
          {t('contrapartes.new', 'Nova Contraparte')}
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        {filterBtn('ALL', t('contrapartes.filter.all', 'Todas'))}
        {filterBtn('SUPPLIER', t('contrapartes.filter.suppliers', 'Fornecedores'))}
        {filterBtn('CUSTOMER', t('contrapartes.filter.customers', 'Clientes'))}
        <label className="ml-2 inline-flex items-center gap-2 text-xs text-neutral-400">
          <input
            type="checkbox"
            checked={includeArchived}
            onChange={(e) => setIncludeArchived(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-neutral-700 bg-neutral-800 text-emerald-500 focus:ring-0"
          />
          {t('contrapartes.filter.includeArchived', 'Incluir arquivadas')}
        </label>
      </div>

      {/* Error banner */}
      {error && (
        <div className="rounded-xl border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-300">{error}</div>
      )}

      {/* Loading */}
      {loading && (
        <div className="py-16 text-center text-neutral-400">{t('contrapartes.loading', 'Carregando contrapartes…')}</div>
      )}

      {/* Empty */}
      {!loading && counterparties.length === 0 && !error && (
        <div className="py-16 text-center text-neutral-500">
          {t('contrapartes.empty', 'Nenhuma contraparte cadastrada nesta unidade ainda.')}
        </div>
      )}

      {/* Table */}
      {!loading && counterparties.length > 0 && (
        <div className="overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900/50">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-neutral-800 text-left text-neutral-400">
                <th className="px-4 py-3 font-medium">{t('contrapartes.col.name', 'Nome')}</th>
                <th className="px-4 py-3 font-medium">{t('contrapartes.col.type', 'Tipo')}</th>
                <th className="px-4 py-3 font-medium">{t('contrapartes.col.ref', 'Referência')}</th>
                <th className="px-4 py-3 font-medium">{t('contrapartes.col.status', 'Situação')}</th>
                <th className="px-4 py-3 font-medium">{t('contrapartes.col.actions', 'Ações')}</th>
              </tr>
            </thead>
            <tbody>
              {counterparties.map((c) => {
                const archived = c.deletedAt !== null;
                return (
                  <tr key={c.id} className="border-b border-neutral-800/60 transition-colors last:border-0">
                    <td className="px-4 py-2.5 text-neutral-100">
                      <span className="line-clamp-1 font-medium">{c.name}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <TypeBadge type={c.type} />
                    </td>
                    <td className="px-4 py-2.5 text-neutral-400">
                      {c.ref ? <span className="font-mono text-xs">{c.ref}</span> : <span className="text-neutral-600">—</span>}
                    </td>
                    <td className="px-4 py-2.5">
                      {archived ? (
                        <span className="inline-flex items-center rounded-full bg-neutral-700/60 px-2 py-0.5 text-xs font-medium text-neutral-300">
                          {t('contrapartes.status.archived', 'Arquivada')}
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-emerald-900/40 px-2 py-0.5 text-xs font-medium text-emerald-300">
                          {t('contrapartes.status.active', 'Ativa')}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2.5">
                      {!archived && (
                        <button
                          onClick={() => { setArchiveError(null); setToArchive(c); }}
                          title={t('contrapartes.action.archiveTitle', 'Arquivar contraparte')}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-xs font-medium text-neutral-300 transition-colors hover:border-amber-700 hover:bg-amber-900/30 hover:text-amber-300"
                        >
                          <FiArchive size={12} />
                          {t('contrapartes.action.archive', 'Arquivar')}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Create modal */}
      <CreateCounterpartyModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
        unitId={unitId}
        onSuccess={() => {
          setIsCreateOpen(false);
          void fetchCounterparties();
        }}
      />

      {/* Archive confirmation modal */}
      <Modal
        isOpen={!!toArchive}
        onClose={() => { if (!busy) setToArchive(null); }}
        title={t('contrapartes.archiveModal.title', 'Arquivar contraparte')}
        themeColor="bg-amber-600"
        maxWidth="max-w-lg"
        footer={
          <>
            <button
              onClick={() => { if (!busy) setToArchive(null); }}
              disabled={busy}
              className="rounded-xl border border-neutral-700 bg-neutral-800 px-4 py-2 text-sm font-medium text-neutral-300 transition-colors hover:bg-neutral-700 disabled:opacity-50"
            >
              {t('contrapartes.archiveModal.cancel', 'Voltar')}
            </button>
            <button
              onClick={() => void runArchive()}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-xl bg-amber-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-500 disabled:opacity-50"
            >
              {busy
                ? t('contrapartes.archiveModal.archiving', 'Arquivando…')
                : t('contrapartes.archiveModal.confirm', 'Confirmar arquivamento')}
            </button>
          </>
        }
      >
        <div className="space-y-4 px-6 py-5 text-sm text-neutral-300">
          {toArchive && (
            <p>
              <span className="font-semibold text-neutral-100">{toArchive.name}</span>
              {' — '}
              {toArchive.type === 'SUPPLIER'
                ? t('contrapartes.type.SUPPLIER', 'Fornecedor')
                : t('contrapartes.type.CUSTOMER', 'Cliente')}
            </p>
          )}
          <p className="text-neutral-400">
            {t('contrapartes.archiveModal.note', 'A contraparte deixa de aparecer na seleção de novas contas. Os lançamentos e contas já vinculados permanecem intactos.')}
          </p>
          {archiveError && (
            <div className="rounded-xl border border-red-900/50 bg-red-950/30 px-3 py-2 text-xs text-red-300">
              {archiveError}
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
