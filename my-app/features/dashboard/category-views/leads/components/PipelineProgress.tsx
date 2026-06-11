'use client';

import React from 'react';

interface PipelineProgressProps {
  pipelineStages: any[];
  currentStageId: string;
  currentStageIndex: number;
  stageProgressLabel: string;
  nextStage: any | null;
  onNoShow: () => void;
  onAdvanceNext: () => void;
}

export default function PipelineProgress({ pipelineStages, currentStageId, currentStageIndex, stageProgressLabel, nextStage, onNoShow, onAdvanceNext }: PipelineProgressProps) {
  return (
    <div className="mb-6 p-1.5 rounded-[2rem] bg-gray-100/50 dark:bg-white/5 border border-gray-200 dark:border-white/5 backdrop-blur-sm shadow-inner">
      <div className="flex flex-col lg:flex-row lg:items-center p-2 lg:p-4 gap-6">

        {/* Stages List */}
        <div className="flex-1 overflow-x-auto custom-scrollbar flex items-center gap-2 pb-2 lg:pb-0">
          {pipelineStages.map((st: any, idx: number) => {
            const sid = String(st.id);
            const isCurrent = sid === currentStageId;
            const isDone = currentStageIndex >= 0 && idx < currentStageIndex;
            const name = String((st.data || {}).name || 'Etapa');

            return (
              <div key={sid} className="flex items-center gap-2 min-w-[120px] flex-1">
                <div className={`relative flex flex-col items-center justify-center py-3 px-4 rounded-2xl transition-all duration-300 flex-1 border ${isCurrent
                    ? 'bg-blue-600 text-white border-blue-500 shadow-lg shadow-blue-500/20 scale-105 z-10'
                    : isDone
                      ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20'
                      : 'bg-white dark:bg-neutral-900 text-gray-400 dark:text-neutral-600 border-gray-200 dark:border-white/5'
                  }`} title={String(((st.data || {}).description || name))}>
                  {isDone && (
                    <div className="absolute top-1 right-1">
                      <svg className="w-3 h-3 text-emerald-500" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg>
                    </div>
                  )}
                  <span className="text-[10px] font-black uppercase tracking-widest opacity-60 mb-0.5">Step {idx + 1}</span>
                  <span className="text-xs font-black truncate max-w-full">{name}</span>
                </div>
                {idx < pipelineStages.length - 1 && (
                  <div className="text-gray-300 dark:text-neutral-800">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Actions Panel */}
        <div className="flex items-center gap-4 bg-white dark:bg-neutral-900 p-3 rounded-2xl border border-gray-200 dark:border-white/5 shadow-sm lg:min-w-[320px]">
          <div className="flex-1">
            <div className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-0.5">Status do Fluxo</div>
            <div className="text-xs font-black text-gray-900 dark:text-white">{stageProgressLabel || 'Aguardando início'}</div>
          </div>

          <div className="flex items-center gap-2">
            {(() => {
              const cur = pipelineStages[currentStageIndex];
              const type = String((cur?.data || {}).type || '').toLowerCase();
              if (type === 'meeting') {
                return (
                  <button onClick={onNoShow} className="px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest bg-rose-500/10 text-rose-600 hover:bg-rose-500 hover:text-white transition-all">No Show</button>
                );
              } return null;
            })()}

            <button
              disabled={!nextStage}
              onClick={onAdvanceNext}
              className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${nextStage
                  ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/20 hover:bg-blue-700 active:scale-95'
                  : 'bg-gray-100 dark:bg-neutral-800 text-gray-400 cursor-not-allowed'
                }`}
            >
              {nextStage ? 'Avançar Etapa' : 'Concluído'}
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
