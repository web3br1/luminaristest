'use client';

import React, { useMemo } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import ptLocale from '@fullcalendar/core/locales/pt-br';
import { useCrmTable } from '../hooks/useCrmTable';

interface CalendarEvent {
  id: string;
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
  const { loading: loadingActs, rows: activities } = useCrmTable('leadActivities');
  const { rows: leads } = useCrmTable('leads');

  const events = useMemo<CalendarEvent[]>(() => {
    const nameById = new Map(leads.map((l) => [l.id, String(l.data?.leadName ?? 'Lead')]));

    // Cancelled meeting instances, keyed by leadId + ISO start.
    const cancelled = new Set<string>();
    for (const a of activities) {
      if (String(a.data?.type ?? '') !== 'meeting_cancelled') continue;
      const when = a.data?.payload?.scheduledAt ?? a.data?.scheduledAt ?? (a as any).updatedAt ?? (a as any).createdAt;
      if (!when) continue;
      cancelled.add(`${String(a.data?.leadId ?? '')}|${new Date(String(when)).toISOString()}`);
    }

    return activities
      .filter((a) => String(a.data?.type ?? '') === 'meeting')
      .map((a) => {
        const leadId = String(a.data?.leadId ?? '');
        const when = a.data?.payload?.when ?? a.data?.when ?? (a as any).updatedAt ?? (a as any).createdAt;
        const startIso = new Date(String(when)).toISOString();
        const endIso = new Date(new Date(startIso).getTime() + 60 * 60 * 1000).toISOString();
        return { id: a.id, leadId, title: `Reunião - ${nameById.get(leadId) ?? 'Lead'}`, start: startIso, end: endIso };
      })
      .filter((ev) => {
        const isFuture = new Date(ev.start).getTime() >= Date.now();
        const isCancelled = cancelled.has(`${(ev as any).leadId}|${ev.start}`);
        return isFuture && !isCancelled;
      })
      .map(({ id, title, start, end }) => ({ id, title, start, end }));
  }, [activities, leads]);

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 dark:border-neutral-800 dark:bg-neutral-900">
      <p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
        {loadingActs ? 'Carregando…' : `${events.length} reuniões encontradas`}
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
