import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import { useTranslation } from 'next-i18next';
import withAuth from '@/lib/hoc/withAuth';
import { useAuth } from '@/lib/context/AuthContext';
import type { GetServerSideProps } from 'next';
import React from 'react';
import DashboardGrid from '../components/widgets/dashboard-grid';

export const getServerSideProps: GetServerSideProps = async ({ locale }) => {
  return {
    props: {
      ...(await serverSideTranslations(locale || 'pt', [
        'common',
        'database',
        'inventory_view',
        'products_view',
        'finance_view',
        'analytics',
        'chatMessages'
      ])),
    },
  };
};

function Home() {
  const { user } = useAuth();
  const { t } = useTranslation('common');

  return (
    <div className="flex h-[calc(100vh-60px)] w-full bg-gray-50 dark:bg-neutral-950 overflow-hidden relative">

      <div className="relative w-full h-full overflow-hidden flex flex-col">
        <main className="flex flex-1 flex-col overflow-hidden relative">
          <DashboardGrid key={user ? user.id : 'anonymous'} />
        </main>
      </div>
    </div>
  );
}

export default withAuth(Home);
