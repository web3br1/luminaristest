import React from 'react';
import { useTranslation } from 'next-i18next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import type { GetServerSideProps, GetServerSidePropsContext } from 'next';
import withAuth from '../../lib/hoc/withAuth';
import { CrmProvider } from '../../lib/context/CrmContext';
import { useCrmTable } from '../../features/crm/hooks/useCrmTable';
import { CrmNav } from '../../features/crm/components/CrmNav';
import { RecordTable, type Column } from '../../features/crm/components/RecordTable';
import { StatusBadge } from '../../features/crm/components/ui/StatusBadge';

function ProposalsInner() {
  const { t } = useTranslation('crm');
  const { loading, error, rows } = useCrmTable('leadProposals');

  const columns: Column[] = [
    {
      key: 'amount',
      label: t('proposals.amount', 'Valor'),
      render: (v, row) =>
        v != null ? `${String(row.data?.currency ?? 'BRL')} ${Number(v).toLocaleString('pt-BR')}` : '—',
    },
    {
      key: 'winProbability',
      label: t('proposals.win', 'Win %'),
      render: (v) => (v != null ? `${Number(v)}%` : '—'),
    },
    {
      key: 'estimatedCloseDate',
      label: t('proposals.eta', 'Fechamento'),
      render: (v) => (v ? new Date(String(v)).toLocaleDateString('pt-BR') : '—'),
    },
    {
      key: 'status',
      label: 'Status',
      render: (v) => <StatusBadge status={String(v ?? 'Draft')} />,
    },
  ];

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <CrmNav />
      <h1 className="mb-4 text-2xl font-black tracking-tight text-gray-900 dark:text-white">
        {t('proposals.title', 'Propostas')}
      </h1>
      {error ? (
        <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">
          {error}
        </div>
      ) : null}
      {loading ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">{t('common.loading', 'Carregando…')}</p>
      ) : (
        <RecordTable columns={columns} rows={rows} emptyLabel={t('proposals.empty', 'Nenhuma proposta ainda.')} />
      )}
    </div>
  );
}

function ProposalsPage() {
  return (
    <CrmProvider>
      <ProposalsInner />
    </CrmProvider>
  );
}

export const getServerSideProps: GetServerSideProps = async (context: GetServerSidePropsContext) => {
  const { locale } = context;
  return { props: { ...(await serverSideTranslations(locale ?? 'en', ['common', 'crm'])) } };
};

export default withAuth(ProposalsPage);
