import React from 'react';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import type { GetServerSideProps, GetServerSidePropsContext } from 'next';
import withAuth from '../../lib/hoc/withAuth';
import { CrmProvider } from '../../lib/context/CrmContext';
import { CrmLayout } from '../../features/crm/components/CrmLayout';
import { CrmTableScreen } from '../../features/crm/components/CrmTableScreen';

function ProposalsPage() {
  return (
    <CrmProvider>
      <CrmLayout>
        <CrmTableScreen
          internalName="leadProposals"
          titleKey="proposals.title"
          descriptionKey="proposals.subtitle"
        />
      </CrmLayout>
    </CrmProvider>
  );
}

export const getServerSideProps: GetServerSideProps = async (context: GetServerSidePropsContext) => {
  const { locale } = context;
  // `database` namespace is required by the canonical GenericTabbedView (column headers,
  // filters, sort labels, tab name use the database:* namespace).
  return { props: { ...(await serverSideTranslations(locale ?? 'en', ['common', 'crm', 'database'])) } };
};

export default withAuth(ProposalsPage);
