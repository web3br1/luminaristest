import React, { useMemo, useState } from 'react';
import { useTranslation } from 'next-i18next';
import { Modal } from '../../../components/ui/Modal';
import { CrmService } from '../../../lib/services/crm.service';
import { resolveErrorMessage } from '../../../lib/utils/error-handler';
import { notify } from '../../../lib/notifications/notify';
import type { CrmRecord } from '../hooks/useCrmData';
import type { ProposalCapture } from '../hooks/useOppPipelineBoard';
import { GradientHeader } from './ui/GradientHeader';
import { StatusBadge } from './ui/StatusBadge';
import { ProposalCaptureModal } from './ProposalCaptureModal';
import { DEFAULT_CURRENCY } from '../lib/constants';

interface Opp360ModalProps {
  isOpen: boolean;
  onClose: () => void;
  opportunity: CrmRecord | null;
  stages: CrmRecord[];
  /** id → owner display name (built by the board from the owner-filter options). */
  ownerNames?: Map<string, string>;
  onChanged: () => void | Promise<void>;
}

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-white/5 dark:bg-neutral-900">
      <h2 className="mb-4 text-[10px] font-black uppercase tracking-widest text-gray-400">{title}</h2>
      {children}
    </section>
  );
}

/**
 * Opportunity 360 detail rendered as a MODAL (not a route) — mirror of
 * `Lead360Modal`. Shows the opportunity fields and an "Avançar etapa" action that
 * runs the atomic `CrmService.advanceOpportunity` transition. When the next stage
 * is a closing stage (`closed_won`/`closed_lost`) the backend sets status Won/Lost
 * + closedAt; a `proposal` next stage opens the capture modal first.
 */
export function Opp360Modal({ isOpen, onClose, opportunity, stages, ownerNames, onChanged }: Opp360ModalProps) {
  const { t } = useTranslation('crm');
  const [advancing, setAdvancing] = useState(false);
  const [capturingProposal, setCapturingProposal] = useState(false);

  const d = opportunity?.data ?? {};

  const nextStage = useMemo(() => {
    if (!opportunity) return undefined;
    const ordered = [...stages]
      .filter((s) => String(s.data?.pipelineId ?? '') === String(d.pipelineId ?? ''))
      .sort((a, b) => Number(a.data?.order ?? 0) - Number(b.data?.order ?? 0));
    const currentIdx = ordered.findIndex((s) => s.id === String(d.stageId ?? ''));
    return currentIdx >= 0 ? ordered[currentIdx + 1] : undefined;
  }, [opportunity, stages, d.pipelineId, d.stageId]);

  const currentStageName = useMemo(() => {
    const stage = stages.find((s) => s.id === String(d.stageId ?? ''));
    return stage ? String(stage.data?.name ?? '') : '—';
  }, [stages, d.stageId]);

  const ownerName = useMemo(() => {
    const id = String(d.ownerId ?? '');
    return (id && ownerNames?.get(id)) || '—';
  }, [d.ownerId, ownerNames]);

  // Run the transition; closing stages close the opp (Won/Lost) on the backend via
  // the stageType. Proposal stages pass the captured amount/currency/win%.
  const runAdvance = async (capture?: ProposalCapture) => {
    if (!opportunity || !nextStage) return;
    const stageType = String(nextStage.data?.type ?? '');
    setAdvancing(true);
    try {
      await CrmService.advanceOpportunity({
        opportunityId: opportunity.id,
        stageId: nextStage.id,
        stageType,
        ...(stageType === 'closed_won' ? { status: 'Won' as const } : {}),
        ...(stageType === 'closed_lost' ? { status: 'Lost' as const } : {}),
        ...(capture
          ? { amount: capture.amount, currency: capture.currency, winProbability: capture.winProbability }
          : {}),
      });
      await onChanged();
      onClose();
    } catch (err) {
      notify(resolveErrorMessage(err, t), 'error', 'CRM');
    } finally {
      setAdvancing(false);
    }
  };

  const handleAdvance = async () => {
    if (!opportunity || !nextStage) return;
    if (String(nextStage.data?.type ?? '') === 'proposal') {
      setCapturingProposal(true);
      return;
    }
    await runAdvance();
  };

  const handleConfirmProposal = async (capture: ProposalCapture) => {
    setCapturingProposal(false);
    await runAdvance(capture);
  };

  if (!opportunity) return null;

  const fmtAmount =
    d.amount != null
      ? `${String(d.currency ?? DEFAULT_CURRENCY)} ${Number(d.amount).toLocaleString('pt-BR')}`
      : '—';

  return (
    <>
      <Modal
        isOpen={isOpen}
        onClose={onClose}
        title={String(d.name ?? t('opportunities.unnamed', 'Unnamed opportunity'))}
        maxWidth="max-w-3xl"
      >
        <div className="space-y-6 p-5">
          <GradientHeader
            avatar={String(d.name ?? 'O')}
            title={String(d.name ?? t('opportunities.unnamed', 'Unnamed opportunity'))}
            subtitle={fmtAmount}
            badges={<StatusBadge status={String(d.status ?? 'Open')} />}
            right={
              <button
                type="button"
                onClick={handleAdvance}
                disabled={!nextStage || advancing}
                className="rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 px-4 py-2.5 text-sm font-black text-white shadow-lg shadow-blue-500/20 transition hover:from-blue-700 hover:to-indigo-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {nextStage
                  ? `${t('opp.advance', 'Avançar etapa')}: ${String(nextStage.data?.name ?? '')}`
                  : t('detail.last_stage', 'Última etapa')}
              </button>
            }
          />

          <SectionCard title={t('opp.details', 'Detalhes')}>
            <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-[10px] font-black uppercase tracking-widest text-gray-400">{t('opp.amount', 'Valor')}</dt>
                <dd className="mt-0.5 font-bold text-gray-800 dark:text-gray-200">{fmtAmount}</dd>
              </div>
              <div>
                <dt className="text-[10px] font-black uppercase tracking-widest text-gray-400">{t('opp.win_probability', 'Win %')}</dt>
                <dd className="mt-0.5 font-bold text-gray-800 dark:text-gray-200">
                  {d.winProbability != null ? `${Number(d.winProbability)}%` : '—'}
                </dd>
              </div>
              <div>
                <dt className="text-[10px] font-black uppercase tracking-widest text-gray-400">{t('opp.stage', 'Etapa')}</dt>
                <dd className="mt-0.5 font-bold text-gray-800 dark:text-gray-200">{currentStageName}</dd>
              </div>
              <div>
                <dt className="text-[10px] font-black uppercase tracking-widest text-gray-400">{t('opp.close_date', 'Fechamento')}</dt>
                <dd className="mt-0.5 font-bold text-gray-800 dark:text-gray-200">{String(d.estimatedCloseDate ?? '—')}</dd>
              </div>
              <div>
                <dt className="text-[10px] font-black uppercase tracking-widest text-gray-400">{t('opp.owner', 'Responsável')}</dt>
                <dd className="mt-0.5 font-bold text-gray-800 dark:text-gray-200">{ownerName}</dd>
              </div>
              <div>
                <dt className="text-[10px] font-black uppercase tracking-widest text-gray-400">{t('opp.status', 'Status')}</dt>
                <dd className="mt-0.5">
                  <StatusBadge status={String(d.status ?? 'Open')} />
                </dd>
              </div>
            </dl>
          </SectionCard>
        </div>
      </Modal>

      <ProposalCaptureModal
        isOpen={capturingProposal}
        stageName={String(nextStage?.data?.name ?? '')}
        onCancel={() => setCapturingProposal(false)}
        onConfirm={handleConfirmProposal}
      />
    </>
  );
}

export default Opp360Modal;
