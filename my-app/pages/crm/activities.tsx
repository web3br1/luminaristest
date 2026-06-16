import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'next-i18next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import type { GetServerSideProps, GetServerSidePropsContext } from 'next';
import withAuth from '../../lib/hoc/withAuth';
import { CrmProvider } from '../../lib/context/CrmContext';
import { useCrmTable } from '../../features/crm/hooks/useCrmTable';
import { CrmLayout } from '../../features/crm/components/CrmLayout';
import { StandardPagination } from '../../features/dashboard/shared/components/StandardPagination';

const TYPE_DOT: Record<string, string> = {
  note: 'bg-gray-400',
  call: 'bg-blue-500',
  email: 'bg-indigo-500',
  meeting: 'bg-emerald-500',
  meeting_no_show: 'bg-amber-500',
  meeting_cancelled: 'bg-rose-500',
  proposal: 'bg-teal-500',
  stage_change: 'bg-purple-500',
  status_change: 'bg-purple-500',
};

const ITEMS_PER_PAGE = 25;

function ActivitiesInner() {
  const { t } = useTranslation('crm');
  const { loading, error, rows } = useCrmTable('leadActivities');
  const [currentPage, setCurrentPage] = useState(1);

  const sorted = useMemo(() => [...rows].sort((a, b) => {
    const ta = new Date(String(a.updatedAt ?? a.createdAt ?? 0)).getTime();
    const tb = new Date(String(b.updatedAt ?? b.createdAt ?? 0)).getTime();
    return tb - ta;
  }), [rows]);

  const totalPages = Math.ceil(sorted.length / ITEMS_PER_PAGE);

  // Guard: reset to page 1 if the data shrinks below the current window.
  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(1);
  }, [currentPage, totalPages]);

  const paginatedSorted = useMemo(
    () => sorted.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE),
    [sorted, currentPage],
  );

  return (
    <CrmLayout>
      <h1 className="mb-4 text-2xl font-black tracking-tight text-gray-900 dark:text-white">
        {t('activities.title', 'Atividades')}
      </h1>
      {error ? (
        <div className="mb-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">
          {error}
        </div>
      ) : null}
      {loading ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">{t('common.loading', 'Carregando…')}</p>
      ) : sorted.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">{t('activities.empty', 'Nenhuma atividade registrada.')}</p>
      ) : (
        <ol className="relative space-y-4 border-l border-gray-200 pl-6 dark:border-neutral-800">
          {paginatedSorted.map((act) => {
            const d = act.data ?? {};
            const type = String(d.type ?? 'note');
            const when = act.updatedAt ?? act.createdAt;
            return (
              <li key={act.id} className="relative">
                <span className={`absolute -left-[27px] top-1.5 h-3 w-3 rounded-full ${TYPE_DOT[type] ?? 'bg-gray-400'}`} />
                <div className="rounded-2xl border border-gray-200 bg-white p-3 dark:border-neutral-800 dark:bg-neutral-900">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400">{t(`activities.types.${type}`, type)}</span>
                    {when ? (
                      <span className="text-xs text-gray-400 dark:text-gray-500">
                        {new Date(String(when)).toLocaleString('pt-BR')}
                      </span>
                    ) : null}
                  </div>
                  {d.message ? (
                    <p className="mt-1 text-sm text-gray-800 dark:text-gray-200">{String(d.message)}</p>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ol>
      )}
      {!loading && sorted.length > 0 ? (
        <StandardPagination
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={sorted.length}
          itemsPerPage={ITEMS_PER_PAGE}
          onPageChange={setCurrentPage}
        />
      ) : null}
    </CrmLayout>
  );
}

function ActivitiesPage() {
  return (
    <CrmProvider>
      <ActivitiesInner />
    </CrmProvider>
  );
}

export const getServerSideProps: GetServerSideProps = async (context: GetServerSidePropsContext) => {
  const { locale } = context;
  return { props: { ...(await serverSideTranslations(locale ?? 'en', ['common', 'crm'])) } };
};

export default withAuth(ActivitiesPage);
