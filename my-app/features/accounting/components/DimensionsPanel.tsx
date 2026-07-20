import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'next-i18next';
import { FiPlusCircle, FiArchive, FiLayers, FiBarChart2, FiChevronRight } from 'react-icons/fi';
import {
  dimensionsService,
  type DimensionCatalogEntry,
  type DimensionDefinition,
  type DimensionValue,
} from '../../../lib/services/dimensions.service';
import { Modal } from '../../../components/ui/Modal';
import { DimensionReports } from './DimensionReports';
import { resolveError } from '../lib/resolveError';


// ── tree helpers ────────────────────────────────────────────────────────────────
interface TreeNode {
  value: DimensionValue;
  depth: number;
  isLeaf: boolean; // no ACTIVE children
}

/**
 * Flatten a definition's values into a DFS-ordered, depth-tagged list. `isLeaf` counts only ACTIVE
 * children (an archived child does not keep a parent taggable). Values whose parent is missing from
 * the set (e.g. archived-and-hidden parent) are treated as roots so nothing disappears.
 */
function buildTree(values: DimensionValue[]): TreeNode[] {
  const byParent = new Map<string | null, DimensionValue[]>();
  const ids = new Set(values.map((v) => v.id));
  for (const v of values) {
    const key = v.parentId && ids.has(v.parentId) ? v.parentId : null;
    const list = byParent.get(key) ?? [];
    list.push(v);
    byParent.set(key, list);
  }
  const activeChildCount = new Map<string, number>();
  for (const v of values) {
    if (v.parentId && v.status === 'ACTIVE') {
      activeChildCount.set(v.parentId, (activeChildCount.get(v.parentId) ?? 0) + 1);
    }
  }
  const out: TreeNode[] = [];
  const walk = (parentId: string | null, depth: number) => {
    const kids = (byParent.get(parentId) ?? []).slice().sort((a, b) => a.code.localeCompare(b.code));
    for (const value of kids) {
      out.push({ value, depth, isLeaf: (activeChildCount.get(value.id) ?? 0) === 0 });
      walk(value.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

// ── status badge ─────────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: 'ACTIVE' | 'ARCHIVED' }) {
  const { t } = useTranslation('accounting');
  const cls = status === 'ACTIVE' ? 'bg-emerald-900/40 text-emerald-300' : 'bg-neutral-700/60 text-neutral-400';
  const label =
    status === 'ACTIVE' ? t('dimensions.status.active', 'Ativo') : t('dimensions.status.archived', 'Arquivado');
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>{label}</span>;
}

// ── props ──────────────────────────────────────────────────────────────────────
interface DimensionsPanelProps {
  unitId: string;
}

type View = 'catalog' | 'reports';

/**
 * DimensionsPanel — the Dimensões tab (INCR-DIM FE). Two surfaces via an internal toggle: the
 * CATALOG manager (axes + hierarchical values, create/archive) and the REPORTS (balancete + DRE por
 * dimensão). A dimension is metadata orthogonal to the ledger (ACC-024); nothing here posts money.
 */
export function DimensionsPanel({ unitId }: DimensionsPanelProps) {
  const { t } = useTranslation('accounting');
  const [view, setView] = useState<View>('catalog');
  const [catalog, setCatalog] = useState<DimensionCatalogEntry[]>([]);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // create-axis modal
  const [isDefOpen, setIsDefOpen] = useState(false);
  // create-value modal (carries the target axis)
  const [valueAxis, setValueAxis] = useState<DimensionCatalogEntry | null>(null);
  // archive confirm
  const [archiveTarget, setArchiveTarget] = useState<
    | { kind: 'definition'; id: string; label: string }
    | { kind: 'value'; id: string; label: string }
    | null
  >(null);
  const [archiveBusy, setArchiveBusy] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);

  const fetchCatalog = useCallback(async () => {
    if (!unitId) return;
    setLoading(true);
    setError(null);
    try {
      setCatalog(await dimensionsService.listCatalog({ unitId, includeArchived }));
    } catch (err: unknown) {
      setError(resolveError(err, t('dimensions.error.load', 'Erro ao carregar as dimensões.')));
    } finally {
      setLoading(false);
    }
  }, [unitId, includeArchived, t]);

  useEffect(() => {
    void fetchCatalog();
  }, [fetchCatalog]);

  async function runArchive() {
    if (!archiveTarget) return;
    setArchiveBusy(true);
    setArchiveError(null);
    try {
      if (archiveTarget.kind === 'definition') {
        await dimensionsService.archiveDefinition(archiveTarget.id, unitId);
      } else {
        await dimensionsService.archiveValue(archiveTarget.id, unitId);
      }
      setArchiveTarget(null);
      await fetchCatalog();
    } catch (err: unknown) {
      setArchiveError(resolveError(err, t('dimensions.error.archive', 'Não foi possível arquivar.')));
    } finally {
      setArchiveBusy(false);
    }
  }

  const activeDefinitions = useMemo(
    () => catalog.map((c) => c.definition).filter((d) => d.status === 'ACTIVE'),
    [catalog],
  );

  return (
    <div className="space-y-5">
      {/* View toggle */}
      <div className="flex items-center justify-between gap-3">
        <div className="inline-flex rounded-xl border border-neutral-800 bg-neutral-900/60 p-0.5">
          <button
            type="button"
            onClick={() => setView('catalog')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              view === 'catalog' ? 'bg-neutral-800 text-emerald-400' : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <FiLayers size={14} />
            {t('dimensions.view.catalog', 'Catálogo')}
          </button>
          <button
            type="button"
            onClick={() => setView('reports')}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
              view === 'reports' ? 'bg-neutral-800 text-emerald-400' : 'text-neutral-400 hover:text-neutral-200'
            }`}
          >
            <FiBarChart2 size={14} />
            {t('dimensions.view.reports', 'Relatórios')}
          </button>
        </div>

        {view === 'catalog' && (
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-xs text-neutral-400">
              <input
                type="checkbox"
                checked={includeArchived}
                onChange={(e) => setIncludeArchived(e.target.checked)}
                className="h-3.5 w-3.5 rounded border-neutral-700 bg-neutral-800 text-emerald-600 focus:ring-0"
              />
              {t('dimensions.includeArchived', 'Incluir arquivados')}
            </label>
            <button
              type="button"
              onClick={() => setIsDefOpen(true)}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 active:bg-emerald-700"
            >
              <FiPlusCircle size={16} />
              {t('dimensions.newAxis', 'Novo Eixo')}
            </button>
          </div>
        )}
      </div>

      {/* Error banner */}
      {error && (
        <div className="rounded-xl border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-300">{error}</div>
      )}

      {/* ── Reports view ─────────────────────────────────────────────────────── */}
      {view === 'reports' && <DimensionReports unitId={unitId} definitions={activeDefinitions} />}

      {/* ── Catalog view ─────────────────────────────────────────────────────── */}
      {view === 'catalog' && (
        <>
          {loading && (
            <div className="py-16 text-center text-neutral-400">{t('dimensions.loading', 'Carregando dimensões…')}</div>
          )}

          {!loading && catalog.length === 0 && !error && (
            <div className="py-16 text-center text-neutral-500">
              {t('dimensions.empty', 'Nenhum eixo de dimensão cadastrado. Crie um centro de custo ou projeto para começar.')}
            </div>
          )}

          {!loading &&
            catalog.map((entry) => (
              <AxisCard
                key={entry.definition.id}
                entry={entry}
                onNewValue={() => setValueAxis(entry)}
                onArchiveDefinition={() =>
                  setArchiveTarget({
                    kind: 'definition',
                    id: entry.definition.id,
                    label: `${entry.definition.code} — ${entry.definition.name}`,
                  })
                }
                onArchiveValue={(v) =>
                  setArchiveTarget({ kind: 'value', id: v.id, label: `${v.code} — ${v.name}` })
                }
              />
            ))}
        </>
      )}

      {/* Create-axis modal */}
      <CreateDefinitionModal
        isOpen={isDefOpen}
        unitId={unitId}
        onClose={() => setIsDefOpen(false)}
        onSuccess={() => {
          setIsDefOpen(false);
          void fetchCatalog();
        }}
      />

      {/* Create-value modal */}
      <CreateValueModal
        entry={valueAxis}
        unitId={unitId}
        onClose={() => setValueAxis(null)}
        onSuccess={() => {
          setValueAxis(null);
          void fetchCatalog();
        }}
      />

      {/* Archive confirm modal */}
      <Modal
        isOpen={!!archiveTarget}
        onClose={() => {
          if (!archiveBusy) {
            setArchiveTarget(null);
            setArchiveError(null);
          }
        }}
        title={t('dimensions.archiveModal.title', 'Arquivar dimensão')}
        themeColor="bg-red-600"
        maxWidth="max-w-lg"
        footer={
          <>
            <button
              onClick={() => {
                setArchiveTarget(null);
                setArchiveError(null);
              }}
              disabled={archiveBusy}
              className="rounded-xl border border-neutral-700 bg-neutral-800 px-4 py-2 text-sm font-medium text-neutral-300 transition-colors hover:bg-neutral-700 disabled:opacity-50"
            >
              {t('dimensions.archiveModal.cancel', 'Voltar')}
            </button>
            <button
              onClick={() => void runArchive()}
              disabled={archiveBusy}
              className="inline-flex items-center gap-2 rounded-xl bg-red-700 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-600 disabled:opacity-50"
            >
              {archiveBusy ? (
                <>
                  <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                  {t('dimensions.archiveModal.archiving', 'Arquivando…')}
                </>
              ) : (
                t('dimensions.archiveModal.confirm', 'Arquivar')
              )}
            </button>
          </>
        }
      >
        <div className="space-y-3 px-6 py-5 text-sm text-neutral-300">
          {archiveTarget && (
            <p>
              <span className="font-semibold text-neutral-100">{archiveTarget.label}</span>
            </p>
          )}
          <p className="text-neutral-400">
            {archiveTarget?.kind === 'definition'
              ? t('dimensions.archiveModal.axisNote', 'Arquive todos os valores do eixo antes de arquivar o eixo. Os vínculos históricos de lançamentos são preservados.')
              : t('dimensions.archiveModal.valueNote', 'Arquive os valores-filho antes deste. O valor deixa de aparecer na etiquetagem, mas os vínculos históricos são preservados.')}
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

// ── axis card ────────────────────────────────────────────────────────────────────
function AxisCard({
  entry,
  onNewValue,
  onArchiveDefinition,
  onArchiveValue,
}: {
  entry: DimensionCatalogEntry;
  onNewValue: () => void;
  onArchiveDefinition: () => void;
  onArchiveValue: (v: DimensionValue) => void;
}) {
  const { t } = useTranslation('accounting');
  const { definition } = entry;
  const nodes = useMemo(() => buildTree(entry.values), [entry.values]);
  const isActive = definition.status === 'ACTIVE';

  return (
    <div className="overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900/50">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 border-b border-neutral-800 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-neutral-500">{definition.code}</span>
          <span className="font-semibold text-neutral-100">{definition.name}</span>
          <StatusBadge status={definition.status} />
        </div>
        {isActive && (
          <div className="flex items-center gap-2">
            <button
              onClick={onNewValue}
              className="inline-flex items-center gap-1.5 rounded-xl border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-xs font-medium text-emerald-300 transition-colors hover:border-emerald-600 hover:bg-emerald-900/30"
            >
              <FiPlusCircle size={12} />
              {t('dimensions.newValue', 'Novo valor')}
            </button>
            <button
              onClick={onArchiveDefinition}
              title={t('dimensions.archiveAxisTitle', 'Arquivar o eixo')}
              className="inline-flex items-center gap-1.5 rounded-xl border border-neutral-700 bg-neutral-800 px-3 py-1.5 text-xs font-medium text-neutral-300 transition-colors hover:border-red-700 hover:bg-red-900/30 hover:text-red-300"
            >
              <FiArchive size={12} />
              {t('dimensions.archive', 'Arquivar')}
            </button>
          </div>
        )}
      </div>

      {/* Values tree */}
      {nodes.length === 0 ? (
        <div className="px-4 py-6 text-center text-xs text-neutral-600">
          {t('dimensions.noValues', 'Nenhum valor neste eixo ainda.')}
        </div>
      ) : (
        <table className="w-full text-sm">
          <tbody>
            {nodes.map(({ value, depth, isLeaf }) => (
              <tr key={value.id} className="border-b border-neutral-800/50 last:border-0">
                <td className="px-4 py-2 text-neutral-200">
                  <span className="inline-flex items-center gap-1.5" style={{ paddingLeft: `${depth * 20}px` }}>
                    {depth > 0 && <FiChevronRight size={12} className="text-neutral-600" />}
                    <span className="font-mono text-xs text-neutral-500">{value.code}</span>
                    <span>{value.name}</span>
                    {!isLeaf && value.status === 'ACTIVE' && (
                      <span className="text-xs text-neutral-600">{t('dimensions.rollupOnly', '(agregador)')}</span>
                    )}
                  </span>
                </td>
                <td className="px-4 py-2">
                  <StatusBadge status={value.status} />
                </td>
                <td className="px-4 py-2 text-right">
                  {value.status === 'ACTIVE' && (
                    <button
                      onClick={() => onArchiveValue(value)}
                      title={t('dimensions.archiveValueTitle', 'Arquivar o valor')}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-neutral-700 bg-neutral-800 px-2.5 py-1 text-xs font-medium text-neutral-300 transition-colors hover:border-red-700 hover:bg-red-900/30 hover:text-red-300"
                    >
                      <FiArchive size={11} />
                      {t('dimensions.archive', 'Arquivar')}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ── create-axis modal ────────────────────────────────────────────────────────────
function CreateDefinitionModal({
  isOpen,
  unitId,
  onClose,
  onSuccess,
}: {
  isOpen: boolean;
  unitId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { t } = useTranslation('accounting');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isValid = code.trim() !== '' && name.trim() !== '';
  const isDirty = code !== '' || name !== '';

  function reset() {
    setCode('');
    setName('');
    setError(null);
  }

  async function submit() {
    if (!isValid) return;
    setBusy(true);
    setError(null);
    try {
      await dimensionsService.createDefinition({ unitId, code: code.trim(), name: name.trim() });
      reset();
      onSuccess();
    } catch (err: unknown) {
      setError(resolveError(err, t('dimensions.createAxis.error', 'Erro ao criar o eixo.')));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        if (!busy) {
          reset();
          onClose();
        }
      }}
      title={t('dimensions.createAxis.title', 'Novo Eixo de Dimensão')}
      themeColor="bg-emerald-600"
      maxWidth="max-w-lg"
      isDirty={isDirty}
      footer={
        <>
          <button
            onClick={() => {
              reset();
              onClose();
            }}
            disabled={busy}
            className="rounded-xl border border-neutral-700 bg-neutral-800 px-4 py-2 text-sm font-medium text-neutral-300 transition-colors hover:bg-neutral-700 disabled:opacity-50"
          >
            {t('dimensions.createAxis.cancel', 'Cancelar')}
          </button>
          <button
            onClick={() => void submit()}
            disabled={!isValid || busy}
            className="rounded-xl bg-emerald-600 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? t('dimensions.createAxis.saving', 'Criando…') : t('dimensions.createAxis.submit', 'Criar')}
          </button>
        </>
      }
    >
      <div className="space-y-4 px-6 py-5">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold uppercase tracking-widest text-neutral-400">
            {t('dimensions.field.code', 'Código')}
          </label>
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder={t('dimensions.createAxis.codePlaceholder', 'Ex.: COST_CENTER, PROJECT')}
            className="rounded-xl border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-600 focus:border-emerald-500 focus:outline-none"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold uppercase tracking-widest text-neutral-400">
            {t('dimensions.field.name', 'Nome')}
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('dimensions.createAxis.namePlaceholder', 'Ex.: Centro de Custo, Projeto')}
            className="rounded-xl border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-600 focus:border-emerald-500 focus:outline-none"
          />
        </div>
        {error && (
          <div className="rounded-xl border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-300">{error}</div>
        )}
      </div>
    </Modal>
  );
}

// ── create-value modal ───────────────────────────────────────────────────────────
function CreateValueModal({
  entry,
  unitId,
  onClose,
  onSuccess,
}: {
  entry: DimensionCatalogEntry | null;
  unitId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const { t } = useTranslation('accounting');
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [parentId, setParentId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Parent candidates: ACTIVE values of this axis (a value at any level may be a rollup parent).
  const parentOptions = useMemo(
    () => (entry ? entry.values.filter((v) => v.status === 'ACTIVE') : []),
    [entry],
  );

  const isValid = code.trim() !== '' && name.trim() !== '';
  const isDirty = code !== '' || name !== '' || parentId !== '';

  function reset() {
    setCode('');
    setName('');
    setParentId('');
    setError(null);
  }

  async function submit() {
    if (!entry || !isValid) return;
    setBusy(true);
    setError(null);
    try {
      await dimensionsService.createValue({
        unitId,
        definitionId: entry.definition.id,
        code: code.trim(),
        name: name.trim(),
        ...(parentId ? { parentId } : {}),
      });
      reset();
      onSuccess();
    } catch (err: unknown) {
      setError(resolveError(err, t('dimensions.createValue.error', 'Erro ao criar o valor.')));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      isOpen={!!entry}
      onClose={() => {
        if (!busy) {
          reset();
          onClose();
        }
      }}
      title={t('dimensions.createValue.title', 'Novo Valor de Dimensão')}
      themeColor="bg-emerald-600"
      maxWidth="max-w-lg"
      isDirty={isDirty}
      footer={
        <>
          <button
            onClick={() => {
              reset();
              onClose();
            }}
            disabled={busy}
            className="rounded-xl border border-neutral-700 bg-neutral-800 px-4 py-2 text-sm font-medium text-neutral-300 transition-colors hover:bg-neutral-700 disabled:opacity-50"
          >
            {t('dimensions.createValue.cancel', 'Cancelar')}
          </button>
          <button
            onClick={() => void submit()}
            disabled={!isValid || busy}
            className="rounded-xl bg-emerald-600 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? t('dimensions.createValue.saving', 'Criando…') : t('dimensions.createValue.submit', 'Criar')}
          </button>
        </>
      }
    >
      <div className="space-y-4 px-6 py-5">
        {entry && (
          <p className="text-xs text-neutral-500">
            {t('dimensions.createValue.axisLabel', 'Eixo')}:{' '}
            <span className="font-medium text-neutral-300">
              {entry.definition.code} — {entry.definition.name}
            </span>
          </p>
        )}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold uppercase tracking-widest text-neutral-400">
            {t('dimensions.field.code', 'Código')}
          </label>
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder={t('dimensions.createValue.codePlaceholder', 'Ex.: LOJA_CENTRO')}
            className="rounded-xl border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-600 focus:border-emerald-500 focus:outline-none"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold uppercase tracking-widest text-neutral-400">
            {t('dimensions.field.name', 'Nome')}
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t('dimensions.createValue.namePlaceholder', 'Ex.: Loja Centro')}
            className="rounded-xl border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-100 placeholder-neutral-600 focus:border-emerald-500 focus:outline-none"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold uppercase tracking-widest text-neutral-400">
            {t('dimensions.field.parent', 'Valor-pai (rollup)')}
            <span className="ml-1 normal-case text-neutral-600">{t('dimensions.optional', '(opcional)')}</span>
          </label>
          <select
            value={parentId}
            onChange={(e) => setParentId(e.target.value)}
            className="rounded-xl border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-100 focus:border-emerald-500 focus:outline-none"
          >
            <option value="">{t('dimensions.createValue.noParent', '— sem pai (raiz) —')}</option>
            {parentOptions.map((v) => (
              <option key={v.id} value={v.id}>
                {v.code} — {v.name}
              </option>
            ))}
          </select>
        </div>
        {error && (
          <div className="rounded-xl border border-red-900/50 bg-red-950/30 px-4 py-3 text-sm text-red-300">{error}</div>
        )}
      </div>
    </Modal>
  );
}
