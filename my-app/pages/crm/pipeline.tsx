import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { useTranslation } from 'next-i18next';
import { serverSideTranslations } from 'next-i18next/serverSideTranslations';
import type { GetServerSideProps, GetServerSidePropsContext } from 'next';
import withAuth from '../../lib/hoc/withAuth';
import { CrmProvider } from '../../lib/context/CrmContext';
import { useCrmData, type CrmRecord } from '../../features/crm/hooks/useCrmData';
import { LeadCard } from '../../features/crm/components/LeadCard';
import { CrmNav } from '../../features/crm/components/CrmNav';

function CrmPipelineInner() {
  const { t } = useTranslation('crm');
  const router = useRouter();
  const { loading, error, leads, stages, pipelines } = useCrmData();
  const [pipelineOverride, setPipelineOverride] = useState<string | null>(null);

  // Default to the pipeline that actually holds the most leads, so the board is
  // never empty when several pipelines exist. The user can switch via the selector.
  const defaultPipelineId = useMemo(() => {
    if (!pipelines.length) return null;
    const counts = new Map<string, number>();
    for (const l of leads) {
      const pid = String(l.data?.pipelineId ?? '');
      if (pid) counts.set(pid, (counts.get(pid) ?? 0) + 1);
    }
    let best = pipelines[0].id;
    let max = -1;
    for (const p of pipelines) {
      const c = counts.get(p.id) ?? 0;
      if (c > max) { max = c; best = p.id; }
    }
    return best;
  }, [pipelines, leads]);

  const activePipelineId = pipelineOverride ?? defaultPipelineId;

  // Only the active pipeline's stages become Kanban columns (avoids duplicate-named
  // columns when multiple pipelines share stage names).
  const orderedStages = useMemo(
    () =>
      stages
        .filter((s) => !activePipelineId || String(s.data?.pipelineId ?? '') === activePipelineId)
        .sort((a, b) => Number(a.data?.order ?? 0) - Number(b.data?.order ?? 0)),
    [stages, activePipelineId],
  );

  const leadsByStageMap = useMemo(() => {
    const m = new Map<string, CrmRecord[]>();
    for (const l of leads) {
      const sid = String(l.data?.stageId ?? '');
      (m.get(sid) ?? m.set(sid, []).get(sid)!).push(l);
    }
    return m;
  }, [leads]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <CrmNav />
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-gray-900 dark:text-white">
            {t('pipeline.title', 'Pipeline')}
          </h1>
          <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">
            {t('pipeline.subtitle', 'Gestão do funil por etapa')}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {pipelines.length > 1 ? (
            <select
              value={activePipelineId ?? ''}
              onChange={(e) => setPipelineOverride(e.target.value)}
              className="rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm font-bold text-gray-700 dark:border-white/10 dark:bg-neutral-800 dark:text-gray-200"
            >
              {pipelines.map((p) => (
                <option key={p.id} value={p.id}>
                  {String(p.data?.name ?? 'Pipeline')}
                </option>
              ))}
            </select>
          ) : null}
          <Link
            href="/crm"
            className="rounded-xl border border-gray-200 px-4 py-2 text-sm font-bold text-gray-700 transition hover:bg-gray-100 dark:border-white/10 dark:text-gray-200 dark:hover:bg-neutral-800"
          >
            {t('pipeline.back', '← Visão Geral')}
          </Link>
        </div>
      </div>

      {error ? (
        <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950 dark:text-rose-300">
          {error}
        </div>
      ) : null}

      {loading ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">{t('common.loading', 'Carregando…')}</p>
      ) : orderedStages.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400">{t('pipeline.no_stages', 'Nenhuma etapa configurada.')}</p>
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-4">
          {orderedStages.map((stage) => {
            const stageLeads = leadsByStageMap.get(stage.id) ?? [];
            return (
              <div key={stage.id} className="w-72 shrink-0">
                <div className="mb-2 flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50/70 px-3 py-2.5 dark:border-white/5 dark:bg-neutral-800/50">
                  <span className="text-[11px] font-black uppercase tracking-widest text-gray-600 dark:text-gray-200">
                    {String(stage.data?.name ?? 'Etapa')}
                  </span>
                  <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-[11px] font-black text-blue-600 dark:text-blue-400">
                    {stageLeads.length}
                  </span>
                </div>
                <div className="space-y-2">
                  {stageLeads.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-gray-200 p-3 text-center text-xs font-semibold text-gray-400 dark:border-white/10 dark:text-gray-500">
                      {t('pipeline.empty_stage', 'Sem registros')}
                    </p>
                  ) : (
                    stageLeads.map((lead) => (
                      <LeadCard key={lead.id} lead={lead} onClick={(id) => router.push(`/crm/leads/${id}`)} />
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CrmPipelinePage() {
  return (
    <CrmProvider>
      <CrmPipelineInner />
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
