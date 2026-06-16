import React from 'react';
import dynamic from 'next/dynamic';
import { useTranslation } from 'next-i18next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import type { GetServerSideProps, GetServerSidePropsContext } from 'next';
import withAuth from '../../lib/hoc/withAuth';
import { CrmProvider } from '../../lib/context/CrmContext';
import { CrmLayout } from '../../features/crm/components/CrmLayout';

// Translated loading state — rendered in-component (where `t` is available)
// since `t` cannot be reached at module scope (mirrors CrmTableScreen).
function CrmLoading() {
  const { t } = useTranslation('crm');
  return <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">{t('common.loading', 'Loading…')}</p>;
}

// Recharts renders client-only — load the analytics dashboard with ssr disabled.
const CrmAnalyticsDashboard = dynamic(
  () => import('../../features/crm/components/analytics/CrmAnalyticsDashboard').then((m) => m.CrmAnalyticsDashboard),
  {
    ssr: false,
    loading: () => <CrmLoading />,
  },
);

function CrmAnalyticsInner() {
  const { t } = useTranslation('crm');
  return (
    <CrmLayout>
      <h1 className="mb-1 text-2xl font-black tracking-tight text-gray-900 dark:text-white">
        {t('analytics.title', 'CRM — Analytics')}
      </h1>
      <p className="mb-6 text-sm font-semibold text-gray-500 dark:text-gray-400">
        {t('analytics.subtitle', 'KPIs do funil, conversão e qualificação')}
      </p>
      <CrmAnalyticsDashboard />
    </CrmLayout>
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
  // `analytics` namespace is required by the canonical ChartRenderer (it calls
  // useTranslation(['analytics']) for chart-title fallbacks).
  return { props: { ...(await serverSideTranslations(locale ?? 'en', ['common', 'crm', 'analytics'])) } };
};

export default withAuth(CrmAnalyticsPage);
