import React from 'react';
import dynamic from 'next/dynamic';
import { useTranslation } from 'next-i18next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import type { GetServerSideProps, GetServerSidePropsContext } from 'next';
import withAuth from '../../lib/hoc/withAuth';
import { CrmProvider } from '../../lib/context/CrmContext';
import { CrmLayout } from '../../features/crm/components/CrmLayout';

// Translated loading state — rendered in-component (where `t` is available),
// mirroring analytics.tsx/CrmTableScreen.
function CrmLoading() {
  const { t } = useTranslation('crm');
  return <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">{t('common.loading', 'Loading…')}</p>;
}

// The board pulls in @dnd-kit (heavy, client-only) — keep it out of the SSR/initial
// bundle via a dynamic import with ssr disabled (contract §3).
const CrmPipelineBoard = dynamic(
  () => import('../../features/crm/components/CrmPipelineBoard').then((m) => m.CrmPipelineBoard),
  {
    ssr: false,
    loading: () => <CrmLoading />,
  },
);

function CrmPipelinePage() {
  return (
    <CrmProvider>
      <CrmLayout>
        <CrmPipelineBoard />
      </CrmLayout>
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

export default withAuth(CrmPipelinePage);
