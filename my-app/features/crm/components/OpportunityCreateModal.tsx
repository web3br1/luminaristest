import React, { useEffect, useState } from 'react';
import { useTranslation } from 'next-i18next';
import { Modal } from '../../../components/ui/Modal';
import { CrmService, type ConvertLeadToOpportunityPayload } from '../../../lib/services/crm.service';
import { resolveErrorMessage } from '../../../lib/utils/error-handler';
import { DynamicTableService } from '../../../lib/services/dynamic-table.service';
import { fetchAllRows } from '../lib/crmFetch';
import { DEFAULT_CURRENCY } from '../lib/constants';
import type { CrmRecord } from '../hooks/useCrmData';

type Currency = 'BRL' | 'USD' | 'EUR';
const CURRENCIES: Currency[] = ['BRL', 'USD', 'EUR'];

interface OpportunityCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  leadId: string | null;
  leadName?: string;
  defaultAccountId?: string;
  onCreated: () => void | Promise<void>;
}

interface DynTable {
  id: string;
  internalName?: string;
}

/**
 * Capture modal that creates a first-class opportunity FROM a lead via the atomic
 * `CrmService.convertLeadToOpportunity` transition (the lead stays Open). Collects
 * name (required), pipeline (required, from `leadPipelines`), optional
 * amount/currency, and optional account link. Built on the canonical `Modal.tsx`
 * primitive; mirror of `LeadConvertModal`.
 */
export function OpportunityCreateModal({
  isOpen,
  onClose,
  leadId,
  leadName,
  defaultAccountId,
  onCreated,
}: OpportunityCreateModalProps) {
  const { t } = useTranslation('crm');

  const [name, setName] = useState('');
  const [pipelineId, setPipelineId] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<Currency>(DEFAULT_CURRENCY as Currency);
  const [accountId, setAccountId] = useState('');

  const [pipelines, setPipelines] = useState<CrmRecord[]>([]);
  const [accounts, setAccounts] = useState<CrmRecord[]>([]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load the pipelines + accounts (by internalName, fetch-all) when the modal opens.
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    (async () => {
      try {
        const tablesRes = await DynamicTableService.getTables();
        const tables: DynTable[] = (tablesRes?.data ?? []) as DynTable[];
        const pipelinesTable = tables.find((tbl) => tbl?.internalName === 'leadPipelines') ?? null;
        const accountsTable = tables.find((tbl) => tbl?.internalName === 'crmAccounts') ?? null;
        const [pipelineRows, accountRows] = await Promise.all([
          pipelinesTable?.id ? (fetchAllRows(pipelinesTable.id) as Promise<CrmRecord[]>) : Promise.resolve([]),
          accountsTable?.id ? (fetchAllRows(accountsTable.id) as Promise<CrmRecord[]>) : Promise.resolve([]),
        ]);
        if (cancelled) return;
        setPipelines(pipelineRows);
        setAccounts(accountRows);
      } catch {
        if (!cancelled) {
          setPipelines([]);
          setAccounts([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  // Reset the form each time the modal (re)opens — prefill name with the lead name
  // and default the account link when the lead is already converted.
  useEffect(() => {
    if (isOpen) {
      setName(leadName ?? '');
      setPipelineId('');
      setAmount('');
      setCurrency(DEFAULT_CURRENCY as Currency);
      setAccountId(defaultAccountId ?? '');
      setSubmitting(false);
      setError(null);
    }
  }, [isOpen, leadName, defaultAccountId]);

  const amountValue = Number(amount);
  const isValid = name.trim() !== '' && pipelineId !== '';

  const handleConfirm = async () => {
    if (!isValid || submitting || !leadId) return;
    setSubmitting(true);
    setError(null);

    const payload: ConvertLeadToOpportunityPayload = {
      leadId,
      name: name.trim(),
      pipelineId,
      ...(amount.trim() !== '' && Number.isFinite(amountValue) ? { amount: amountValue, currency } : {}),
      ...(accountId ? { accountId } : {}),
    };

    try {
      await CrmService.convertLeadToOpportunity(payload);
      await onCreated();
      onClose();
    } catch (err) {
      setError(resolveErrorMessage(err, t));
    } finally {
      setSubmitting(false);
    }
  };

  const inputClass =
    'w-full rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-bold text-gray-800 outline-none focus:border-blue-400 dark:border-white/10 dark:bg-neutral-800 dark:text-gray-200';
  const labelClass = 'mb-1 block text-[10px] font-black uppercase tracking-widest text-gray-400';

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t('opp.create', 'Criar Oportunidade')}
      maxWidth="max-w-lg"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-bold text-gray-700 transition hover:bg-gray-100 dark:border-white/10 dark:text-gray-200 dark:hover:bg-neutral-800"
          >
            {t('opp.cancel', 'Cancelar')}
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!isValid || submitting}
            className="rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 px-4 py-2 text-sm font-black text-white shadow-lg shadow-blue-500/20 transition hover:from-blue-700 hover:to-indigo-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? t('opp.saving', 'Salvando…') : t('opp.save', 'Criar')}
          </button>
        </>
      }
    >
      <div className="space-y-4 p-5">
        <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">
          {t('opp.create_subtitle', 'Crie uma oportunidade a partir deste lead. O lead permanece em aberto.')}
        </p>

        {error ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm font-semibold text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">
            {error}
          </div>
        ) : null}

        <div>
          <label className={labelClass}>{t('opp.name', 'Nome')} *</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
            className={inputClass}
          />
        </div>

        <div>
          <label className={labelClass}>{t('opp.pipeline', 'Pipeline')} *</label>
          <select value={pipelineId} onChange={(e) => setPipelineId(e.target.value)} className={inputClass}>
            <option value="">{t('opp.pipeline_ph', 'Selecione um pipeline')}</option>
            {pipelines.map((p) => (
              <option key={p.id} value={p.id}>
                {String(p.data?.name ?? p.id)}
              </option>
            ))}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>{t('opp.amount', 'Valor')}</label>
            <input
              type="number"
              min={0}
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className={inputClass}
              placeholder="0,00"
            />
          </div>
          <div>
            <label className={labelClass}>{t('opp.currency', 'Moeda')}</label>
            <select value={currency} onChange={(e) => setCurrency(e.target.value as Currency)} className={inputClass}>
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className={labelClass}>{t('opp.account', 'Conta')}</label>
          <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className={inputClass}>
            <option value="">{t('opp.account_ph', 'Sem conta')}</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {String(a.data?.name ?? a.id)}
              </option>
            ))}
          </select>
        </div>
      </div>
    </Modal>
  );
}

export default OpportunityCreateModal;
