import React from 'react';
import { useTranslation } from 'next-i18next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import type { GetServerSideProps, GetServerSidePropsContext } from 'next';
import withAuth from '../../lib/hoc/withAuth';
import { CrmProvider } from '../../lib/context/CrmContext';
import { useCrmTable } from '../../features/crm/hooks/useCrmTable';
import { CrmNav } from '../../features/crm/components/CrmNav';
import { RecordTable, type Column } from '../../features/crm/components/RecordTable';

function AccountsInner() {
  const { t } = useTranslation('crm');
  const { loading, error, rows } = useCrmTable('crmAccounts');

  const columns: Column[] = [
    { key: 'name', label: t('accounts.name', 'Empresa') },
    { key: 'segment', label: t('accounts.segment', 'Segmento') },
    { key: 'size', label: t('accounts.size', 'Porte') },
    {
      key: 'website',
      label: 'Website',
      render: (v) =>
        v ? (
          <a href={String(v)} target="_blank" rel="noreferrer" className="text-blue-600 hover:underline dark:text-blue-400">
            {String(v)}
          </a>
        ) : (
          '—'
        ),
    },
    { key: 'city', label: t('accounts.city', 'Cidade') },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <CrmNav />
      <h1 className="mb-4 text-2xl font-black tracking-tight text-gray-900 dark:text-white">
        {t('accounts.title', 'Contas')}
      </h1>
      {error ? (
        <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">
          {error}
        </div>
      ) : null}
      {loading ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">{t('common.loading', 'Carregando…')}</p>
      ) : (
        <RecordTable columns={columns} rows={rows} emptyLabel={t('accounts.empty', 'Nenhuma conta. Instale o módulo CRM para começar.')} />
      )}
    </div>
  );
}

function AccountsPage() {
  return (
    <CrmProvider>
      <AccountsInner />
    </CrmProvider>
  );
}

export const getServerSideProps: GetServerSideProps = async (context: GetServerSidePropsContext) => {
  const { locale } = context;
  return { props: { ...(await serverSideTranslations(locale ?? 'en', ['common', 'crm'])) } };
};

export default withAuth(AccountsPage);
