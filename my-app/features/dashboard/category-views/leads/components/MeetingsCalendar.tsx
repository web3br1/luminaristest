'use client';

import React, { useEffect, useState } from 'react';
import { getCookie } from 'cookies-next';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import ptLocale from '@fullcalendar/core/locales/pt-br';
import { DynamicTableService } from '../../../../../lib/services/dynamic-table.service';
import type { IDynamicTable, IDynamicTableData } from '@/features/dashboard/components/shared/dynamic-tables.client';

interface MeetingsCalendarProps {
  selectedUnitId: string | null;
  activitiesTable: IDynamicTable | null;
  filteredLeads: IDynamicTableData[];
  onOpenLead: (leadId: string) => void;
  onStatsChange?: (loading: boolean, count: number) => void;
}

export default function MeetingsCalendar({ selectedUnitId, activitiesTable, filteredLeads, onOpenLead, onStatsChange }: MeetingsCalendarProps) {
  const [meetings, setMeetings] = useState<Array<{ id: string; leadId: string; title: string; start: string; end: string }>>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        if (!selectedUnitId || !activitiesTable?.id) { setMeetings([]); onStatsChange?.(false, 0); return; }
        setLoading(true); onStatsChange?.(true, 0);
        type CalRow = IDynamicTableData & { updatedAt?: string; createdAt?: string };
        const b = await DynamicTableService.getTableData(activitiesTable.id).catch(()=>({ data: undefined }));
        const rows = (Array.isArray(b?.data) ? b.data : []) as CalRow[];
        const cancelledMap = new Map<string, Set<string>>();
        rows.filter((row)=> String((row.data||{}).type||'')==='meeting_cancelled').forEach((row)=>{
          const d = row.data||{}; const lid = String(d.leadId||'');
          const when = String((d.payload as Record<string, unknown>)?.scheduledAt || d.scheduledAt || row.updatedAt || row.createdAt);
          const iso = new Date(when).toISOString();
          if (!cancelledMap.has(lid)) cancelledMap.set(lid, new Set());
          cancelledMap.get(lid)!.add(iso);
        });
        const unitLeadIds = new Set((filteredLeads||[]).map((l)=> String(l.id)));
        const onlyMeetings = rows.filter((row)=> String((row.data||{}).type||'')==='meeting' && unitLeadIds.has(String((row.data||{}).leadId||'')));
        const byDate = onlyMeetings.map((row) => {
          const d = row.data || {};
          const leadId = String(d.leadId||'');
          const when = String((d.payload as Record<string, unknown>)?.when || d.when || row.updatedAt || row.createdAt);
          const startIso = new Date(when).toISOString();
          const endIso = new Date(new Date(startIso).getTime() + 60*60*1000).toISOString();
          const lead = (filteredLeads||[]).find((l)=> String(l.id)===leadId);
          const leadName = String((lead?.data||{}).leadName || 'Lead');
          return { id: String(row.id), leadId, title: `Reunião - ${leadName}`, start: startIso, end: endIso };
        }).filter((ev)=>{
          const isFuture = new Date(ev.start).getTime() >= Date.now();
          const cset = cancelledMap.get(String(ev.leadId));
          const cancelled = cset ? cset.has(ev.start) : false;
          return isFuture && !cancelled;
        });
        setMeetings(byDate); onStatsChange?.(false, byDate.length);
      } catch { setMeetings([]); onStatsChange?.(false, 0); }
      finally { setLoading(false); }
    })();
  }, [selectedUnitId, activitiesTable?.id, JSON.stringify(filteredLeads?.map((l)=>l.id))]);

  function renderMeetingEventContent(eventInfo: { event: { title: string }; view: { type: string } }) {
    const viewType = String(eventInfo?.view?.type || '');
    const isTimeGrid = viewType.startsWith('timeGrid');
    if (isTimeGrid) {
      return (
        <div className="flex items-center w-full text-sm font-medium cursor-pointer truncate">
          <span className="truncate">{eventInfo.event.title}</span>
        </div>
      );
    }
    return (
      <div className="flex items-center justify-between w-full text-sm font-medium cursor-pointer">
        <span className="flex items-center gap-2 truncate">
          <span className="inline-flex w-2 h-2 rounded-full bg-blue-500"></span>
          <span className="truncate">{eventInfo.event.title}</span>
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full w-full bg-white dark:bg-neutral-900 p-4 md:p-6 rounded-lg shadow-lg">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm text-gray-600 dark:text-gray-300">{loading ? 'Carregando reuniões…' : `${meetings.length} reuniões encontradas`}</div>
      </div>
      <div className="leads-meetings flex-1 min-h-0 overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
        <FullCalendar
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          height="100%"
          initialView="dayGridMonth"
          events={meetings}
          locales={[ptLocale]}
          locale='pt-br'
          headerToolbar={{ left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek,timeGridDay' }}
          buttonText={{ today: 'Hoje', month: 'Mês', week: 'Semana', day: 'Dia' }}
          expandRows={true}
          displayEventTime={true}
          eventTimeFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
          eventClassNames={'border-none rounded-xl text-sm font-semibold cursor-pointer !text-white dark:!text-white group overflow-hidden px-2.5 py-1.5 backdrop-blur-md ring-1 ring-white/20 dark:ring-white/10 shadow-none bg-white/10 dark:bg-white/10'}
          dayHeaderClassNames={'!border-b-0 text-sm font-medium text-gray-600 dark:text-gray-300 pb-2'}
          viewClassNames={'!border-0'}
          nowIndicator={true}
          navLinks={true}
          dayMaxEventRows={3}
          moreLinkContent={(arg: { num?: number }) => `+${Number(arg?.num)||0} mais`}
          eventClick={(info) => {
            const leadId = String((info.event.extendedProps as { leadId?: string })?.leadId || '');
            if (leadId) { onOpenLead(leadId); }
          }}
          eventContent={renderMeetingEventContent}
          slotMinTime="07:00:00"
          slotMaxTime="21:00:00"
          weekends={true}
          viewDidMount={(arg) => {
            arg.el.querySelectorAll('.fc-button').forEach(button => {
              button.classList.add('px-3','py-1.5','text-sm','font-medium','rounded-md','transition-colors','duration-150','bg-gray-100','dark:bg-gray-700','text-gray-700','dark:text-gray-200','hover:bg-gray-200','dark:hover:bg-gray-600');
            });
            arg.el.querySelectorAll('.fc-day-today').forEach(day => { day.classList.add('!bg-blue-50','dark:!bg-blue-900/20'); });
            arg.el.querySelectorAll('.fc-col-header-cell-cushion').forEach(el => { el.classList.add('text-gray-700','dark:text-gray-300'); });
            arg.el.querySelectorAll('.fc-daygrid-day-number').forEach(el => { el.classList.add('text-gray-700','dark:text-gray-300'); });
            arg.el.querySelectorAll('.fc-toolbar-title').forEach(title => { title.classList.add('text-xl','font-semibold','text-gray-800','dark:text-gray-100'); });
            arg.el.querySelectorAll('.fc-scroller').forEach(scroller => { (scroller as HTMLElement).classList.add('custom-scrollbar','dark:custom-scrollbar'); });
          }}
        />
      </div>
      <style jsx global>{`
        :root { --fc-page-bg-color: #ffffff; --fc-neutral-bg-color: #f8fafc; --fc-neutral-text-color: #64748b; --fc-border-color: #e5e7eb; --fc-button-text-color: #111827; --fc-button-bg-color: #f3f4f6; --fc-button-border-color: transparent; --fc-button-hover-bg-color: #e5e7eb; --fc-button-active-bg-color: #dbeafe; --fc-event-bg-color: #3b82f6; --fc-event-border-color: transparent; --fc-event-text-color: #ffffff; --fc-today-bg-color: rgba(59, 130, 246, 0.08); --fc-now-indicator-color: #ef4444; }
        .dark { --fc-page-bg-color: #0b1220; --fc-neutral-bg-color: #0f172a; --fc-neutral-text-color: #cbd5e1; --fc-border-color: #334155; --fc-button-text-color: #e5e7eb; --fc-button-bg-color: #1f2937; --fc-button-border-color: transparent; --fc-button-hover-bg-color: #374151; --fc-button-active-bg-color: #1d4ed8; --fc-event-bg-color: #3b82f6; --fc-event-border-color: transparent; --fc-event-text-color: #ffffff; --fc-today-bg-color: rgba(59, 130, 246, 0.15); --fc-now-indicator-color: #ef4444; }
        .fc .fc-theme-standard .fc-scrollgrid, .fc .fc-theme-standard td, .fc .fc-theme-standard th { border-color: #e5e7eb; }
        .dark .fc .fc-theme-standard .fc-scrollgrid, .dark .fc .fc-theme-standard td, .fc .fc-theme-standard th { border-color: #374151; }
        .fc .fc-col-header-cell-cushion, .fc .fc-daygrid-day-number, .fc .fc-timegrid-axis-cushion, .fc .fc-timegrid-slot-label-cushion, .fc .fc-toolbar-title { color: #1f2937; }
        .dark .fc .fc-col-header-cell-cushion, .dark .fc .fc-daygrid-day-number, .dark .fc .fc-timegrid-axis-cushion, .dark .fc .fc-timegrid-slot-label-cushion, .dark .fc .fc-toolbar-title { color: #e5e7eb; }
        .fc .fc-day-today { background-color: rgba(59, 130, 246, 0.08); }
        .dark .fc .fc-day-today { background-color: rgba(59, 130, 246, 0.15); }
        .fc .fc-timegrid-slot { background-color: var(--fc-page-bg-color); height: 4.25rem; }
        .dark .fc .fc-timegrid-slot { background-color: var(--fc-page-bg-color); height: 4.25rem; }
        .fc .fc-timegrid-event { min-height: 2.25rem; display: flex; align-items: center; }
        .fc .fc-timegrid-event .fc-event-main { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
        .fc .fc-timegrid-now-indicator-line { border-color: #ef4444; }
        .fc .fc-timegrid-now-indicator-arrow { border-color: #ef4444 transparent transparent transparent; }
        /* Scoped glassmorphism for meetings */
        .leads-meetings .fc .fc-event {
          background: rgba(255, 255, 255, 0.12);
          border: 1px solid rgba(255, 255, 255, 0.18);
          box-shadow: none;
          backdrop-filter: blur(8px) saturate(120%);
          -webkit-backdrop-filter: blur(8px) saturate(120%);
          border-radius: 12px;
        }
        .dark .leads-meetings .fc .fc-event {
          background: rgba(30, 41, 59, 0.35);
          border: 1px solid rgba(148, 163, 184, 0.18);
          box-shadow: none;
        }
        .fc .fc-daygrid-dot-event .fc-event-title { color: #ffffff; }
        .fc .fc-button { border: none; }
      `}</style>
    </div>
  );
}




