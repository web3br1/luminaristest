import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import type { GetServerSideProps, GetServerSidePropsContext } from 'next';
import withAuth from '../../../lib/hoc/withAuth';
import { CrmProvider } from '../../../lib/context/CrmContext';
import { useCrmData, type CrmRecord } from '../../../features/crm/hooks/useCrmData';
import { CrmService } from '../../../lib/services/crm.service';
import { resolveErrorMessage } from '../../../lib/utils/error-handler';
import { notify } from '../../../lib/notifications/notify';
import { CrmNav } from '../../../features/crm/components/CrmNav';
import { GradientHeader } from '../../../features/crm/components/ui/GradientHeader';
import { ScoreGauge } from '../../../features/crm/components/ui/ScoreGauge';
import { StatusBadge } from '../../../features/crm/components/ui/StatusBadge';
import { BantBars } from '../../../features/crm/components/ui/BantBars';

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm dark:border-white/5 dark:bg-neutral-900">
      <h2 className="mb-4 text-[10px] font-black uppercase tracking-widest text-gray-400">{title}</h2>
      {children}
    </section>
  );
}

function LeadDetailInner() {
  const { t } = useTranslation('crm');
  const router = useRouter();
  const leadId = String(router.query.id ?? '');
  const { loading, leads, stages, reload } = useCrmData();
  const [advancing, setAdvancing] = useState(false);

  const lead: CrmRecord | undefined = leads.find((l) => l.id === leadId);
  const d = lead?.data ?? {};

  const orderedStages = [...stages]
    .filter((s) => String(s.data?.pipelineId ?? '') === String(d.pipelineId ?? ''))
    .sort((a, b) => Number(a.data?.order ?? 0) - Number(b.data?.order ?? 0));
  const currentIdx = orderedStages.findIndex((s) => s.id === String(d.stageId ?? ''));
  const nextStage = currentIdx >= 0 ? orderedStages[currentIdx + 1] : undefined;

  const handleAdvance = async () => {
    if (!lead || !nextStage) return;
    setAdvancing(true);
    try {
      await CrmService.advanceStage({
        leadId: lead.id,
        stageId: nextStage.id,
        stageType: String(nextStage.data?.type ?? ''),
      });
      await reload();
    } catch (err) {
      notify(resolveErrorMessage(err, t), 'error', 'CRM');
    } finally {
      setAdvancing(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl px-4 py-6">
      <CrmNav />
      <Link href="/crm/pipeline" className="text-[11px] font-black uppercase tracking-widest text-blue-600 hover:underline dark:text-blue-400">
        {t('detail.back', '← Pipeline')}
      </Link>

      {loading ? (
        <p className="mt-6 text-sm font-semibold text-gray-400">{t('common.loading', 'Carregando…')}</p>
      ) : !lead ? (
        <p className="mt-6 text-sm font-semibold text-gray-400">{t('detail.not_found', 'Lead não encontrado.')}</p>
      ) : (
        <div className="mt-4 space-y-6">
          <GradientHeader
            avatar={String(d.leadName ?? 'L')}
            title={String(d.leadName ?? 'Lead')}
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
                <dt className="text-[10px] font-black uppercase tracking-widest text-gray-400">Email</dt>
                <dd className="mt-0.5 font-bold text-gray-800 dark:text-gray-200">{String(d.email ?? '—')}</dd>
              </div>
              <div>
                <dt className="text-[10px] font-black uppercase tracking-widest text-gray-400">{t('detail.phone', 'Telefone')}</dt>
                <dd className="mt-0.5 font-bold text-gray-800 dark:text-gray-200">{String(d.phone ?? '—')}</dd>
              </div>
              <div>
                <dt className="text-[10px] font-black uppercase tracking-widest text-gray-400">{t('detail.status', 'Status')}</dt>
                <dd className="mt-0.5"><StatusBadge status={String(d.status ?? 'Open')} /></dd>
              </div>
            </dl>
          </SectionCard>
        </div>
      )}
    </div>
  );
}

function LeadDetailPage() {
  return (
    <CrmProvider>
      <LeadDetailInner />
    </CrmProvider>
  );
}

export const getServerSideProps: GetServerSideProps = async (context: GetServerSidePropsContext) => {
  const { locale } = context;
  return {
    props: {
      ...(await serverSideTranslations(locale ?? 'en', ['common', 'crm'])),
    },
  };
};

export default withAuth(LeadDetailPage);
