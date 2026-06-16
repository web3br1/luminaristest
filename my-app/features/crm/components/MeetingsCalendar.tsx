'use client';

import React, { useMemo } from 'react';
import { useTranslation } from 'next-i18next';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import ptLocale from '@fullcalendar/core/locales/pt-br';
import { useCrmTable } from '../hooks/useCrmTable';
import { MEETING_DURATION_MS } from '../lib/constants';

interface CalendarEvent {
  id: string;
  leadId: string;
  title: string;
  start: string;
  end: string;
}

/**
 * CRM meetings calendar — derives future, non-cancelled meeting events from the
 * `leadActivities` table (type === 'meeting'), titled with the lead name.
 * Mirrors the legacy LeadsView MeetingsCalendar but isolated under the CRM module.
 */
export function MeetingsCalendar() {
  const { t } = useTranslation('crm');
  const { loading: loadingActs, rows: activities } = useCrmTable('leadActivities');
  const { rows: leads } = useCrmTable('leads');

  const events = useMemo<CalendarEvent[]>(() => {
    const nameById = new Map(leads.map((l) => [l.id, String(l.data?.leadName ?? t('detail.unnamed_lead', 'Unnamed lead'))]));

    // Cancelled meeting instances, keyed by leadId + ISO start.
    const cancelled = new Set<string>();
    for (const a of activities) {
      if (String(a.data?.type ?? '') !== 'meeting_cancelled') continue;
      const payload = a.data?.payload as Record<string, unknown> | undefined;
      const when = payload?.scheduledAt ?? a.data?.scheduledAt ?? a.updatedAt ?? a.createdAt;
      if (!when) continue;
      cancelled.add(`${String(a.data?.leadId ?? '')}|${new Date(String(when)).toISOString()}`);
    }

    return activities
      .filter((a) => String(a.data?.type ?? '') === 'meeting')
      .map((a) => {
        const leadId = String(a.data?.leadId ?? '');
        const actPayload = a.data?.payload as Record<string, unknown> | undefined;
        const when = actPayload?.when ?? a.data?.when ?? a.updatedAt ?? a.createdAt;
        const startIso = new Date(String(when)).toISOString();
        const endIso = new Date(new Date(startIso).getTime() + MEETING_DURATION_MS).toISOString();
        const title = t('meetings.event_title', { name: nameById.get(leadId) ?? t('detail.unnamed_lead', 'Unnamed lead'), defaultValue: 'Reunião - {{name}}' });
        return { id: a.id, leadId, title, start: startIso, end: endIso };
      })
      .filter((ev) => {
        const isFuture = new Date(ev.start).getTime() >= Date.now();
        const isCancelled = cancelled.has(`${ev.leadId}|${ev.start}`);
        return isFuture && !isCancelled;
      })
      .map(({ id, leadId, title, start, end }) => ({ id, leadId, title, start, end }));
  }, [activities, leads, t]);

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
        {loadingActs ? t('meetings.loading', 'Carregando…') : t('meetings.count', { count: events.length, defaultValue: '{{count}} reuniões encontradas' })}
      </p>
      <FullCalendar
        plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
        initialView="dayGridMonth"
        locale={ptLocale}
        headerToolbar={{ left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek,timeGridDay' }}
        events={events}
        height="auto"
      />
    </div>
  );
}

export default MeetingsCalendar;
