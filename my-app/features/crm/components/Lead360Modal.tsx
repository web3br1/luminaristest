import React, { useMemo, useState } from 'react';
import { useTranslation } from 'next-i18next';
import { Modal } from '../../../components/ui/Modal';
import { CrmService } from '../../../lib/services/crm.service';
import { resolveErrorMessage } from '../../../lib/utils/error-handler';
import { notify } from '../../../lib/notifications/notify';
import type { CrmRecord } from '../hooks/useCrmData';
import type { ProposalCapture } from '../hooks/useCrmPipelineBoard';
import { formatTimestamp } from '../lib/dates';
import { GradientHeader } from './ui/GradientHeader';
import { ScoreGauge } from './ui/ScoreGauge';
import { StatusBadge } from './ui/StatusBadge';
import { BantBars } from './ui/BantBars';
import { ProposalCaptureModal } from './ProposalCaptureModal';
import { NoShowCaptureModal } from './NoShowCaptureModal';
import { LeadConvertModal } from './LeadConvertModal';
import { OpportunityCreateModal } from './OpportunityCreateModal';
import { LeadTasksPanel } from './LeadTasksPanel';
import { LeadNotesPanel } from './LeadNotesPanel';
import { LeadTimelinePanel } from './LeadTimelinePanel';
import { LeadAttachmentsPanel } from './LeadAttachmentsPanel';
import { Lead360Provider } from '../context/Lead360Context';

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
  // Set while collecting account/contact input for the lead conversion.
  const [converting, setConverting] = useState(false);
  // Set while collecting input to create a first-class opportunity from the lead.
  const [creatingOpp, setCreatingOpp] = useState(false);
  // Set while collecting the no-show resolution (reschedule / revert one stage).
  const [recordingNoShow, setRecordingNoShow] = useState(false);
  const [noShowSaving, setNoShowSaving] = useState(false);

  const d = lead?.data ?? {};
  const isConverted = String(d.status ?? '') === 'Converted';

  const nextStage = useMemo(() => {
    if (!lead) return undefined;
    const ordered = [...stages]
      .filter((s) => String(s.data?.pipelineId ?? '') === String(d.pipelineId ?? ''))
      .sort((a, b) => Number(a.data?.order ?? 0) - Number(b.data?.order ?? 0));
    const currentIdx = ordered.findIndex((s) => s.id === String(d.stageId ?? ''));
    return currentIdx >= 0 ? ordered[currentIdx + 1] : undefined;
  }, [lead, stages, d.pipelineId, d.stageId]);

  // The previous stage in pipeline order — supplies `previousStageId` for the
  // no-show "revert" option and gates whether reverting is possible at all.
  const prevStage = useMemo(() => {
    if (!lead) return undefined;
    const ordered = [...stages]
      .filter((s) => String(s.data?.pipelineId ?? '') === String(d.pipelineId ?? ''))
      .sort((a, b) => Number(a.data?.order ?? 0) - Number(b.data?.order ?? 0));
    const currentIdx = ordered.findIndex((s) => s.id === String(d.stageId ?? ''));
    return currentIdx > 0 ? ordered[currentIdx - 1] : undefined;
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

  // Record a meeting no-show. The backend writes the activity row AND updates the
  // lead atomically — the client sends ONLY the payload. recordNoShow already
  // emits the success toast, so only errors are notified here.
  const handleNoShowConfirm = async (capture: { option: 'reschedule' | 'revert'; rescheduleAt?: string }) => {
    if (!lead) return;
    setNoShowSaving(true);
    try {
      await CrmService.recordNoShow({
        leadId: lead.id,
        option: capture.option,
        ...(capture.option === 'reschedule' ? { rescheduleAt: capture.rescheduleAt } : { previousStageId: prevStage?.id }),
      });
      setRecordingNoShow(false);
      await onChanged();
      onClose();
    } catch (err) {
      notify(resolveErrorMessage(err, t), 'error', 'CRM');
    } finally {
      setNoShowSaving(false);
    }
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
              {isConverted ? (
                <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-emerald-600 dark:text-emerald-400">
                  {t('convert.converted_badge', 'Convertido')}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={() => setConverting(true)}
                  className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-sm font-black text-emerald-600 transition hover:bg-emerald-500/20 dark:text-emerald-400"
                >
                  {t('convert.button', 'Converter Lead')}
                </button>
              )}
              <button
                type="button"
                onClick={() => setCreatingOpp(true)}
                className="rounded-xl border border-blue-500/30 bg-blue-500/10 px-4 py-2.5 text-sm font-black text-blue-600 transition hover:bg-blue-500/20 dark:text-blue-400"
              >
                {t('opp.create_from_lead', 'Criar Oportunidade')}
              </button>
              <button
                type="button"
                onClick={() => setRecordingNoShow(true)}
                disabled={noShowSaving}
                className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-2.5 text-sm font-black text-amber-600 transition hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-50 dark:text-amber-400"
              >
                {t('noshow.button', 'Não compareceu')}
              </button>
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

        <SectionCard title={t('detail.active_proposal', 'Proposta Ativa')}>
          <dl className="grid grid-cols-1 gap-4 text-sm">
            <div>
              <dt className="text-[10px] font-black uppercase tracking-widest text-gray-400">{t('detail.proposal_amount', 'Valor Negociado')}</dt>
              <dd className="mt-0.5 font-bold text-gray-800 dark:text-gray-200">
                {d.latestProposalAmount != null
                  ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: String(d.latestProposalCurrency ?? 'BRL') }).format(Number(d.latestProposalAmount))
                  : t('detail.proposal_amount_tbd', 'Preço sob consulta')}
              </dd>
            </div>
            <div className="flex flex-col gap-2">
              <dt className="text-[10px] font-black uppercase tracking-widest text-gray-400">{t('detail.proposal_win', 'Probabilidade de Fechamento')}</dt>
              <div className="flex h-2 w-full overflow-hidden rounded-full bg-gray-200 shadow-inner dark:bg-neutral-800">
                <div
                  className={`h-full transition-all duration-1000 ${Number(d.latestProposalWinProbability) >= 70 ? 'bg-emerald-500' : Number(d.latestProposalWinProbability) >= 40 ? 'bg-amber-500' : 'bg-rose-500'}`}
                  style={{ width: `${Number(d.latestProposalWinProbability ?? 0)}%` }}
                />
              </div>
              <div className="text-right text-[10px] font-black italic text-gray-500">{String(d.latestProposalWinProbability ?? 0)}% {t('detail.proposal_win_suffix', 'de chance')}</div>
            </div>
            <div>
              <dt className="text-[10px] font-black uppercase tracking-widest text-gray-400">{t('detail.proposal_eta', 'Previsão de Encerramento')}</dt>
              <dd className="mt-0.5 font-bold text-gray-800 dark:text-gray-200">
                {d.latestProposalEtaClose
                  ? new Date(d.latestProposalEtaClose as string | number).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' })
                  : t('detail.proposal_eta_tbd', 'Indefinida')}
              </dd>
            </div>
          </dl>
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
            <div>
              <dt className="text-[10px] font-black uppercase tracking-widest text-gray-400">{t('detail.next_action', 'Próxima ação')}</dt>
              <dd className="mt-0.5 font-bold text-gray-800 dark:text-gray-200">{formatTimestamp(d.nextActionAt)}</dd>
            </div>
          </dl>
        </SectionCard>

        <Lead360Provider leadId={lead.id}>
          <SectionCard title={t('detail.tasks', 'Tarefas')}>
            <LeadTasksPanel leadId={lead.id} onChanged={() => { void onChanged(); }} />
          </SectionCard>

          <SectionCard title={t('detail.notes', 'Notas')}>
            <LeadNotesPanel leadId={lead.id} onChanged={() => { void onChanged(); }} />
          </SectionCard>

          <SectionCard title={t('detail.timeline', 'Linha do Tempo')}>
            <LeadTimelinePanel leadId={lead.id} />
          </SectionCard>

          <SectionCard title={t('detail.attachments', 'Anexos')}>
            <LeadAttachmentsPanel leadId={lead.id} onChanged={() => { void onChanged(); }} />
          </SectionCard>
        </Lead360Provider>
      </div>
    </Modal>

      <ProposalCaptureModal
        isOpen={capturingProposal}
        stageName={String(nextStage?.data?.name ?? '')}
        onCancel={() => setCapturingProposal(false)}
        onConfirm={handleConfirmProposal}
      />

      <NoShowCaptureModal
        isOpen={recordingNoShow}
        canRevert={!!prevStage}
        onCancel={() => setRecordingNoShow(false)}
        onConfirm={handleNoShowConfirm}
      />

      <LeadConvertModal
        isOpen={converting}
        onClose={() => setConverting(false)}
        leadId={lead.id}
        leadName={String(d.leadName ?? '')}
        onConverted={onChanged}
      />

      <OpportunityCreateModal
        isOpen={creatingOpp}
        onClose={() => setCreatingOpp(false)}
        leadId={lead.id}
        leadName={String(d.leadName ?? '')}
        defaultAccountId={d.accountId ? String(d.accountId) : undefined}
        onCreated={onChanged}
      />
    </>
  );
}

export default Lead360Modal;
