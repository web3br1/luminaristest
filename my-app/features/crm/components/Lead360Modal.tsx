import React, { useMemo, useState } from 'react';
import { useTranslation } from 'next-i18next';
import { Modal } from '../../../components/ui/Modal';
import { CrmService } from '../../../lib/services/crm.service';
import { resolveErrorMessage } from '../../../lib/utils/error-handler';
import { notify } from '../../../lib/notifications/notify';
import type { CrmRecord } from '../hooks/useCrmData';
import type { ProposalCapture } from '../hooks/useCrmPipelineBoard';
import { GradientHeader } from './ui/GradientHeader';
import { ScoreGauge } from './ui/ScoreGauge';
import { StatusBadge } from './ui/StatusBadge';
import { BantBars } from './ui/BantBars';
import { ProposalCaptureModal } from './ProposalCaptureModal';

interface Lead360ModalProps {
  isOpen: boolean;
  onClose: () => void;
  lead: CrmRecord | null;
  stages: CrmRecord[];
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
 * Lead 360 detail rendered as a MODAL (not a route) — reuses the same content as
 * `pages/crm/leads/[id].tsx` (GradientHeader, ScoreGauge, StatusBadge, BantBars,
 * contact section, "Avançar etapa"). The pipeline board opens this on card click.
 */
export function Lead360Modal({ isOpen, onClose, lead, stages, onChanged }: Lead360ModalProps) {
  const { t } = useTranslation('crm');
  const [advancing, setAdvancing] = useState(false);
  // Set while the next stage is a `proposal` and we await amount input.
  const [capturingProposal, setCapturingProposal] = useState(false);

  const d = lead?.data ?? {};

  const nextStage = useMemo(() => {
    if (!lead) return undefined;
    const ordered = [...stages]
      .filter((s) => String(s.data?.pipelineId ?? '') === String(d.pipelineId ?? ''))
      .sort((a, b) => Number(a.data?.order ?? 0) - Number(b.data?.order ?? 0));
    const currentIdx = ordered.findIndex((s) => s.id === String(d.stageId ?? ''));
    return currentIdx >= 0 ? ordered[currentIdx + 1] : undefined;
  }, [lead, stages, d.pipelineId, d.stageId]);

  // Run the transition; proposal stages pass the captured amount/currency/win%
  // so the backend can create the proposal (it requires an amount).
  const runAdvance = async (capture?: ProposalCapture) => {
    if (!lead || !nextStage) return;
    setAdvancing(true);
    try {
      await CrmService.advanceStage({
        leadId: lead.id,
        stageId: nextStage.id,
        stageType: String(nextStage.data?.type ?? ''),
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
    if (!lead || !nextStage) return;
    // Proposal stages need amount input first — mirror the board's capture flow.
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

  if (!lead) return null;

  return (
    <>
    <Modal isOpen={isOpen} onClose={onClose} title={String(d.leadName ?? t('detail.unnamed_lead', 'Unnamed lead'))} maxWidth="max-w-4xl">
      <div className="space-y-6 p-5">
        <GradientHeader
          avatar={String(d.leadName ?? 'L')}
          title={String(d.leadName ?? t('detail.unnamed_lead', 'Unnamed lead'))}
          subtitle={String(d.source ?? '')}
          badges={<StatusBadge status={String(d.status ?? 'Open')} />}
          right={
            <div className="flex items-center gap-4">
              <ScoreGauge score={Number(d.score ?? 0)} size={56} />
              <button
                type="button"
                onClick={handleAdvance}
                disabled={!nextStage || advancing}
                className="rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 px-4 py-2.5 text-sm font-black text-white shadow-lg shadow-blue-500/20 transition hover:from-blue-700 hover:to-indigo-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {nextStage
                  ? `${t('detail.advance', 'Avançar para')}: ${String(nextStage.data?.name ?? '')}`
                  : t('detail.last_stage', 'Última etapa')}
              </button>
            </div>
          }
        />

        <SectionCard title={t('detail.bant', 'Qualificação BANT')}>
          <BantBars data={d} />
        </SectionCard>

        <SectionCard title={t('detail.contact', 'Contato')}>
          <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-[10px] font-black uppercase tracking-widest text-gray-400">{t('detail.email', 'Email')}</dt>
              <dd className="mt-0.5 font-bold text-gray-800 dark:text-gray-200">{String(d.email ?? '—')}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-black uppercase tracking-widest text-gray-400">{t('detail.phone', 'Telefone')}</dt>
              <dd className="mt-0.5 font-bold text-gray-800 dark:text-gray-200">{String(d.phone ?? '—')}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-black uppercase tracking-widest text-gray-400">{t('detail.status', 'Status')}</dt>
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

export default Lead360Modal;
