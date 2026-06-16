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

// FullCalendar does not render server-side — load the calendar client-only.
const MeetingsCalendar = dynamic(
  () => import('../../features/crm/components/MeetingsCalendar').then((m) => m.MeetingsCalendar),
  {
    ssr: false,
    loading: () => <CrmLoading />,
  },
);

function MeetingsInner() {
  const { t } = useTranslation('crm');
  return (
    <CrmLayout>
      <h1 className="mb-4 text-2xl font-black tracking-tight text-gray-900 dark:text-white">
        {t('meetings.title', 'Reuniões')}
      </h1>
      <MeetingsCalendar />
    </CrmLayout>
  );
}

function MeetingsPage() {
  return (
    <CrmProvider>
      <MeetingsInner />
    </CrmProvider>
  );
}

export const getServerSideProps: GetServerSideProps = async (context: GetServerSidePropsContext) => {
  const { locale } = context;
  return { props: { ...(await serverSideTranslations(locale ?? 'en', ['common', 'crm'])) } };
};

export default withAuth(MeetingsPage);
