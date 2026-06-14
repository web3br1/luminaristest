import React from 'react';
import dynamic from 'next/dynamic';
import { useTranslation } from 'next-i18next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import type { GetServerSideProps, GetServerSidePropsContext } from 'next';
import withAuth from '../../lib/hoc/withAuth';
import { CrmProvider } from '../../lib/context/CrmContext';
import { CrmNav } from '../../features/crm/components/CrmNav';

// Recharts renders client-only — load the analytics board with ssr disabled.
const CrmAnalyticsBoard = dynamic(
  () => import('../../features/crm/components/analytics/CrmAnalyticsBoard').then((m) => m.CrmAnalyticsBoard),
  {
    ssr: false,
    loading: () => <p className="text-sm font-semibold text-gray-400">Carregando analytics…</p>,
  },
);

function CrmAnalyticsInner() {
  const { t } = useTranslation('crm');
  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <CrmNav />
      <h1 className="mb-1 text-2xl font-black tracking-tight text-gray-900 dark:text-white">
        {t('analytics.title', 'CRM — Analytics')}
      </h1>
      <p className="mb-6 text-sm font-semibold text-gray-500 dark:text-gray-400">
        {t('analytics.subtitle', 'KPIs do funil, conversão e qualificação')}
      </p>
      <CrmAnalyticsBoard />
    </div>
  );
}

function CrmAnalyticsPage() {
  return (
    <CrmProvider>
      <CrmAnalyticsInner />
    </CrmProvider>
  );
}

export const getServerSideProps: GetServerSideProps = async (context: GetServerSidePropsContext) => {
  const { locale } = context;
  return { props: { ...(await serverSideTranslations(locale ?? 'en', ['common', 'crm'])) } };
};

export default withAuth(CrmAnalyticsPage);
