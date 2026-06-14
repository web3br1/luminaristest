import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import type { GetServerSideProps, GetServerSidePropsContext } from 'next';
import withAuth from '../../lib/hoc/withAuth';
import { CrmProvider } from '../../lib/context/CrmContext';
import { useCrmData } from '../../features/crm/hooks/useCrmData';
import { CrmKpiCard } from '../../features/crm/components/CrmKpiCard';
import { LeadCard } from '../../features/crm/components/LeadCard';
import { CrmNav } from '../../features/crm/components/CrmNav';
import { GradientHeader } from '../../features/crm/components/ui/GradientHeader';

function CrmOverviewInner() {
  const { t } = useTranslation('crm');
  const router = useRouter();
  const { loading, error, leads, kpis } = useCrmData();

  const hotLeads = [...leads]
    .sort((a, b) => Number(b.data?.score ?? 0) - Number(a.data?.score ?? 0))
    .slice(0, 6);

  const currency = (n: number) => `R$ ${n.toLocaleString('pt-BR')}`;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <CrmNav />

      <GradientHeader
        avatar="CRM"
        title={t('overview.title', 'CRM — Visão Geral')}
        subtitle={t('overview.subtitle', 'Versão resumida do Leads 360')}
        right={
          <Link
            href="/crm/pipeline"
            className="inline-flex items-center rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 px-4 py-2.5 text-sm font-black text-white shadow-lg shadow-blue-500/20 transition hover:from-blue-700 hover:to-indigo-800"
          >
            {t('overview.open_pipeline', 'Abrir Pipeline')}
          </Link>
        }
      />

      {error ? (
        <div className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-700 dark:border-rose-900/40 dark:bg-rose-950/40 dark:text-rose-300">
          {error}
        </div>
      ) : null}

      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-5">
        <CrmKpiCard label={t('kpi.total', 'Total de Leads')} value={loading ? '—' : String(kpis.totalLeads)} />
        <CrmKpiCard label={t('kpi.open', 'Em aberto')} value={loading ? '—' : String(kpis.openLeads)} />
        <CrmKpiCard label={t('kpi.won', 'Ganhos')} value={loading ? '—' : String(kpis.wonLeads)} tone="positive" />
        <CrmKpiCard label={t('kpi.pipeline_value', 'Valor do Pipeline')} value={loading ? '—' : currency(kpis.pipelineValue)} />
        <CrmKpiCard label={t('kpi.win_rate', 'Win Rate')} value={loading ? '—' : `${kpis.winRate}%`} tone={kpis.winRate >= 50 ? 'positive' : 'default'} />
      </div>

      <h2 className="mb-3 mt-8 text-[11px] font-black uppercase tracking-widest text-gray-400">
        {t('overview.hot_leads', 'Leads mais quentes')}
      </h2>
      {loading ? (
        <p className="text-sm font-semibold text-gray-400">{t('common.loading', 'Carregando…')}</p>
      ) : hotLeads.length === 0 ? (
        <p className="text-sm font-semibold text-gray-400">{t('overview.empty', 'Nenhum lead encontrado.')}</p>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {hotLeads.map((lead) => (
            <LeadCard key={lead.id} lead={lead} onClick={(id) => router.push(`/crm/leads/${id}`)} />
          ))}
        </div>
      )}
    </div>
  );
}

function CrmOverviewPage() {
  return (
    <CrmProvider>
      <CrmOverviewInner />
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

export default withAuth(CrmOverviewPage);
