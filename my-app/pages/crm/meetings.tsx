import React from 'react';
import dynamic from 'next/dynamic';
import { useTranslation } from 'next-i18next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import type { GetServerSideProps, GetServerSidePropsContext } from 'next';
import withAuth from '../../lib/hoc/withAuth';
import { CrmProvider } from '../../lib/context/CrmContext';
import { CrmNav } from '../../features/crm/components/CrmNav';

// FullCalendar does not render server-side — load the calendar client-only.
const MeetingsCalendar = dynamic(
  () => import('../../features/crm/components/MeetingsCalendar').then((m) => m.MeetingsCalendar),
  {
    ssr: false,
    loading: () => <p className="text-sm text-gray-500 dark:text-gray-400">Carregando calendário…</p>,
  },
);

function MeetingsInner() {
  const { t } = useTranslation('crm');
  return (
    <div className="mx-auto max-w-5xl px-4 py-6">
      <CrmNav />
      <h1 className="mb-4 text-2xl font-black tracking-tight text-gray-900 dark:text-white">
        {t('meetings.title', 'Reuniões')}
      </h1>
      <MeetingsCalendar />
    </div>
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
