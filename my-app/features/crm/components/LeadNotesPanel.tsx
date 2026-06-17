'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'next-i18next';
import { DynamicTableService } from '../../../lib/services/dynamic-table.service';
import { resolveErrorMessage } from '../../../lib/utils/error-handler';
import { useAuth } from '../../../lib/context/AuthContext';
import { fetchAllRows } from '../lib/crmFetch';
import { isTableSchema } from '../../dashboard/components/shared/dynamic-tables.client';
import { useLeadNotes } from '../hooks/useLeadNotes';

interface LeadNotesPanelProps {
  leadId: string;
  onChanged?: () => void;
}

interface EmployeeOption {
  id: string;
  name: string;
  email: string;
}

function formatTimestamp(value: unknown): string {
  const raw = String(value ?? '');
  if (!raw) return '—';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleString();
}

/**
 * Real CRM notes log for a single lead, rendered inside the Lead360 modal. Each
 * note is a `leadActivities` row (`type === 'note'`) — timestamped and attributed
 * to the acting employee. Lists existing notes and offers inline creation. All
 * persistence goes through the generic DynamicTableService — no bespoke table,
 * modal-not-route, service layer only (mirror of LeadTasksPanel).
 */
export function LeadNotesPanel({ leadId, onChanged }: LeadNotesPanelProps) {
  const { t } = useTranslation('crm');
  const { user } = useAuth();
  const { loading, error, notes, activitiesTableId, reload } = useLeadNotes(leadId);

  const [employees, setEmployees] = useState<EmployeeOption[]>([]);
  // Whether the installed leadActivities schema has a `type` select offering a
  // 'note' option. If a tenant's table wasn't synced, creating with type:'note'
  // would be invalid/silently dropped (Zod) — so we hide the add form and explain
  // instead (mirror of LeadTasksPanel's supportsLeadLink gate).
  const [supportsNotes, setSupportsNotes] = useState(false);

  // Inline create form state.
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Resolve the employees table from the leadActivities schema's `actorId`
  // relation (mirror of useOwnerFilter's owner detection), then load it once to
  // map actorId → employee name and to resolve the current user's employee id.
  // Never assume a fixed table id.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!activitiesTableId) {
        setEmployees([]);
        setSupportsNotes(false);
        return;
      }
      try {
        const meta = await DynamicTableService.getTableById(activitiesTableId);
        const schema = (meta as { schema?: unknown })?.schema;
        if (!isTableSchema(schema)) {
          if (!cancelled) {
            setEmployees([]);
            setSupportsNotes(false);
          }
          return;
        }
        if (!cancelled) {
          const typeField = schema.fields.find((f) => f.name === 'type' && f.type === 'select');
          const hasNoteOption = (typeField?.options ?? []).some((opt) =>
            (typeof opt === 'string' ? opt : opt.value) === 'note',
          );
          setSupportsNotes(Boolean(typeField) && hasNoteOption);
        }
        const field = schema.fields.find((f) => f.name === 'actorId' && f.type === 'relation');
        const targetTable = field?.relation?.targetTable ?? null;
        if (!targetTable) {
          if (!cancelled) setEmployees([]);
          return;
        }
        const rows = await fetchAllRows(targetTable);
        const mapped = rows.map((row) => {
          const dd = row?.data || {};
          const first = String(dd.firstName || '').trim();
          const last = String(dd.lastName || '').trim();
          const full = String(dd.fullName || '').trim();
          const email = String(dd.email || '').trim();
          const name =
            full ||
            [first, last].filter(Boolean).join(' ').trim() ||
            String(dd.name || '').trim() ||
            String(dd.username || '').trim() ||
            email ||
            String(row.id);
          return { id: String(row.id), name, email };
        });
        if (!cancelled) setEmployees(mapped);
      } catch {
        if (!cancelled) {
          setEmployees([]);
          setSupportsNotes(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activitiesTableId]);

  const employeeName = useMemo(() => {
    const map = new Map<string, string>();
    for (const e of employees) map.set(e.id, e.name);
    return (id: unknown): string => {
      const key = String(id ?? '');
      if (!key) return '';
      return map.get(key) ?? '';
    };
  }, [employees]);

  // Resolve the current user to an employee id: case-insensitive email match
  // (fallback name). user.id is the auth-account id (NOT the employee row id),
  // so we match by email/name against the loaded employees (padrão useOwnerFilter).
  const myEmployeeId = useMemo<string | null>(() => {
    const email = user?.email?.trim().toLowerCase();
    const name = user?.name?.trim().toLowerCase();
    if (email) {
      const byEmail = employees.find((e) => e.email.trim().toLowerCase() === email);
      if (byEmail) return byEmail.id;
    }
    if (name) {
      const byName = employees.find((e) => e.name.trim().toLowerCase() === name);
      if (byName) return byName.id;
    }
    return null;
  }, [user?.email, user?.name, employees]);

  const submitCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activitiesTableId) return;
    const msg = message.trim();
    if (!msg) {
      setFormError(t('notes.required_error', 'Informe o conteúdo da nota.'));
      return;
    }
    setSubmitting(true);
    setFormError(null);
    try {
      await DynamicTableService.createRecord(activitiesTableId, {
        data: {
          leadId,
          type: 'note',
          message: msg,
          ...(myEmployeeId ? { actorId: myEmployeeId } : {}),
        },
      });
      setMessage('');
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

  if (!activitiesTableId) {
    return <p className="text-sm font-bold text-gray-400">{t('notes.not_available', 'Notas não disponíveis.')}</p>;
  }

  return (
    <div className="space-y-3">
      {notes.length === 0 ? (
        <p className="text-sm font-bold text-gray-400">{t('notes.empty', 'Nenhuma nota.')}</p>
      ) : (
        <ul className="space-y-2">
          {notes.map((note) => {
            const author = employeeName(note.data?.actorId) || '—';
            return (
              <li
                key={note.id}
                className="rounded-2xl border border-gray-200 bg-white px-4 py-3 dark:border-white/5 dark:bg-neutral-900/60"
              >
                <p className="whitespace-pre-wrap text-sm font-bold text-gray-800 dark:text-gray-200">
                  {String(note.data?.message ?? '')}
                </p>
                <div className="mt-2 flex items-center gap-2 text-xs font-bold text-gray-500 dark:text-gray-400">
                  <span>
                    {t('notes.by', 'Por')} {author}
                  </span>
                  <span aria-hidden>·</span>
                  <span>{formatTimestamp(note.createdAt)}</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {!supportsNotes ? (
        <p className="text-xs font-bold text-gray-400">{t('notes.not_available', 'Notas não disponíveis.')}</p>
      ) : (
        <form
          onSubmit={submitCreate}
          className="space-y-3 rounded-2xl border border-gray-200 bg-gray-50 p-4 dark:border-white/5 dark:bg-neutral-900/60"
        >
          <textarea
            value={message}
            onChange={(ev) => setMessage(ev.target.value)}
            rows={3}
            placeholder={t('notes.placeholder', 'Escreva uma nota…')}
            className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm font-bold text-gray-800 outline-none focus:border-blue-500 dark:border-white/10 dark:bg-neutral-800 dark:text-gray-200"
          />

          {formError && <p className="text-sm font-bold text-rose-600 dark:text-rose-400">{formError}</p>}

          <div className="flex items-center justify-end">
            <button
              type="submit"
              disabled={submitting}
              className="rounded-xl bg-gradient-to-br from-blue-600 to-indigo-700 px-4 py-2 text-sm font-black text-white shadow-lg shadow-blue-500/20 transition hover:from-blue-700 hover:to-indigo-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? t('notes.adding', 'Adicionando…') : t('notes.add', 'Adicionar nota')}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}

export default LeadNotesPanel;
