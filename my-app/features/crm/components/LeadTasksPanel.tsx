'use client';

import React, { useMemo, useState } from 'react';
import { useTranslation } from 'next-i18next';
import { DynamicTableService } from '../../../lib/services/dynamic-table.service';
import { resolveErrorMessage } from '../../../lib/utils/error-handler';
import { useLeadTasks } from '../hooks/useLeadTasks';
import { useActorNames } from '../hooks/useActorNames';
import { formatDate, formatTimestamp } from '../lib/dates';

interface LeadTasksPanelProps {
  leadId: string;
  onChanged?: () => void;
}

const PRIORITIES = ['Low', 'Medium', 'High', 'Urgent'] as const;

const PRIORITY_TONES: Record<string, string> = {
  Urgent: 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20',
  High: 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
  Medium: 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20',
  Low: 'bg-gray-500/10 text-gray-600 dark:text-gray-300 border-gray-500/20',
};

function PriorityBadge({ priority }: { priority: string }) {
  if (!priority) return null;
  const tone = PRIORITY_TONES[priority] ?? PRIORITY_TONES.Low;
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-widest ${tone}`}>
      {priority}
    </span>
  );
}

/**
 * Real CRM tasks for a single lead, rendered inside the Lead360 modal. Lists
 * the lead's tasks (toggle Done, priority, due date, owner) and offers inline
 * creation. All persistence goes through the generic DynamicTableService — no
 * bespoke table, modal-not-route, service layer only.
 */
export function LeadTasksPanel({ leadId, onChanged }: LeadTasksPanelProps) {
  const { t } = useTranslation('crm');
  const { loading, error, tasks, tasksTableId, reload } = useLeadTasks(leadId);

  const { actors, actorName, schema } = useActorNames(tasksTableId, 'assigneeId');
  const [busyId, setBusyId] = useState<string | null>(null);
  // Whether the installed tasks schema has the `leadId` relation. If a tenant's
  // tasks table wasn't synced, creating would silently strip leadId (Zod drops
  // unknown keys) and the task would vanish from this lead-scoped list — so we
  // hide the create form and explain instead of producing an orphan.
  const supportsLeadLink = useMemo(
    () => Boolean(schema?.fields.some((f) => f.name === 'leadId' && f.type === 'relation')),
    [schema],
  );

  // Inline create form state.
  const [creating, setCreating] = useState(false);
  const [formName, setFormName] = useState('');
  const [formDate, setFormDate] = useState('');
  const [formPriority, setFormPriority] = useState<string>('Medium');
  const [formAssignee, setFormAssignee] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const toggleDone = async (taskId: string, currentStatus: string) => {
    if (!tasksTableId) return;
    const nextStatus = currentStatus === 'Done' ? 'To Do' : 'Done';
    setBusyId(taskId);
    try {
      await DynamicTableService.updateRecord(tasksTableId, taskId, { data: { status: nextStatus } });
      await reload();
      onChanged?.();
    } catch (err) {
      setFormError(resolveErrorMessage(err, t));
    } finally {
      setBusyId(null);
    }
  };

  const resetForm = () => {
    setFormName('');
    setFormDate('');
    setFormPriority('Medium');
    setFormAssignee('');
    setFormError(null);
  };

  const submitCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tasksTableId) return;
    const name = formName.trim();
    if (!name || !formDate) {
      setFormError(t('tasks.required_error', 'Informe nome e data de vencimento.'));
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      await DynamicTableService.createRecord(tasksTableId, {
        data: {
          name,
          status: 'To Do',
          date: formDate,
          priority: formPriority,
          assigneeId: formAssignee || null,
          leadId,
          order: 0,
        },
      });
      resetForm();
      setCreating(false);
      await reload();
      onChanged?.();
    } catch (err) {
      setFormError(resolveErrorMessage(err, t));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <p className="text-sm font-bold text-gray-400">{t('common.loading', 'Carregando…')}</p>;
  }

  if (error) {
    return <p className="text-sm font-bold text-rose-600 dark:text-rose-400">{error}</p>;
  }

  if (!tasksTableId) {
    return <p className="text-sm font-bold text-gray-400">{t('tasks.not_available', 'Tarefas não disponíveis.')}</p>;
  }

  return (
    <div className="space-y-3">
      {tasks.length === 0 ? (
        <p className="text-sm font-bold text-gray-400">{t('detail.no_tasks', 'Nenhuma tarefa.')}</p>
      ) : (
        <ul className="space-y-2">
          {tasks.map((task) => {
            const status = String(task.data?.status ?? 'To Do');
            const isDone = status === 'Done';
            const owner = actorName(task.data?.assigneeId);
            return (
              <li
                key={task.id}
                className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-white px-4 py-3 dark:border-white/5 dark:bg-neutral-900/60"
              >
                <input
                  type="checkbox"
                  checked={isDone}
                  disabled={busyId === task.id}
                  onChange={() => toggleDone(task.id, status)}
                  aria-label={t('tasks.toggle_done', 'Concluir tarefa')}
                  className="h-4 w-4 shrink-0 rounded border-gray-300 text-blue-600 focus:ring-blue-500 dark:border-white/20 dark:bg-neutral-800"
                />
                <span
                  className={`flex-1 truncate text-sm font-bold ${
                    isDone ? 'text-gray-400 line-through' : 'text-gray-800 dark:text-gray-200'
                  }`}
                >
                  {String(task.data?.name ?? '')}
                </span>
                <PriorityBadge priority={String(task.data?.priority ?? '')} />
                <span className="shrink-0 text-xs font-bold text-gray-500 dark:text-gray-400">
                  {formatDate(task.data?.date)}
                </span>
                {task.data?.reminderAt ? (
                  <span className="shrink-0 text-xs font-bold text-amber-600 dark:text-amber-400">
                    {t('tasks.reminder', 'Lembrete')}: {formatTimestamp(task.data.reminderAt)}
                  </span>
                ) : null}
                {owner && (
                  <span className="shrink-0 truncate text-xs font-bold text-gray-500 dark:text-gray-400">{owner}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {!supportsLeadLink ? (
        <p className="text-xs font-bold text-gray-400">{t('tasks.not_available', 'Tarefas não disponíveis.')}</p>
      ) : creating ? (
        <form
          onSubmit={submitCreate}
          className="space-y-3 rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-white/5 dark:bg-neutral-900/60"
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-[10px] font-black uppercase tracking-widest text-gray-400">
                {t('tasks.name', 'Nome')}
              </span>
              <input
                type="text"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                required
                className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm font-bold text-gray-800 outline-none focus:border-blue-500 dark:border-white/10 dark:bg-neutral-800 dark:text-gray-200"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] font-black uppercase tracking-widest text-gray-400">
                {t('tasks.due_date', 'Vencimento')}
              </span>
              <input
                type="date"
                value={formDate}
                onChange={(e) => setFormDate(e.target.value)}
                required
                className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm font-bold text-gray-800 outline-none focus:border-blue-500 dark:border-white/10 dark:bg-neutral-800 dark:text-gray-200"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] font-black uppercase tracking-widest text-gray-400">
                {t('tasks.priority', 'Prioridade')}
              </span>
              <select
                value={formPriority}
                onChange={(e) => setFormPriority(e.target.value)}
                className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm font-bold text-gray-800 outline-none focus:border-blue-500 dark:border-white/10 dark:bg-neutral-800 dark:text-gray-200"
              >
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-[10px] font-black uppercase tracking-widest text-gray-400">
                {t('tasks.owner', 'Responsável')}
              </span>
              <select
                value={formAssignee}
                onChange={(e) => setFormAssignee(e.target.value)}
                className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm font-bold text-gray-800 outline-none focus:border-blue-500 dark:border-white/10 dark:bg-neutral-800 dark:text-gray-200"
              >
                <option value="">{t('tasks.unassigned', 'Sem responsável')}</option>
                {actors.map((emp) => (
                  <option key={emp.id} value={emp.id}>
                    {emp.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {formError && <p className="text-sm font-bold text-rose-600 dark:text-rose-400">{formError}</p>}

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setCreating(false);
                resetForm();
              }}
              className="rounded-xl border border-gray-300 px-4 py-2 text-sm font-black text-gray-600 transition hover:bg-gray-100 dark:border-white/10 dark:text-gray-300 dark:hover:bg-white/5"
            >
              {t('tasks.cancel', 'Cancelar')}
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 px-4 py-2 text-sm font-black text-white shadow-lg shadow-blue-500/20 transition hover:from-blue-700 hover:to-indigo-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t('tasks.save', 'Salvar')}
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setCreating(true)}
          className="rounded-xl border border-blue-500/30 bg-blue-500/10 px-4 py-2 text-sm font-black text-blue-600 transition hover:bg-blue-500/20 dark:text-blue-400"
        >
          {t('detail.new_task', '+ Nova tarefa')}
        </button>
      )}
    </div>
  );
}

export default LeadTasksPanel;
