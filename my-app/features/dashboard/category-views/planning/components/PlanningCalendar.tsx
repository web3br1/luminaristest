'use client';
import React, { useCallback } from 'react';
import dynamic from 'next/dynamic';
import { useTranslation } from 'next-i18next';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import ptLocale from '@fullcalendar/core/locales/pt-br';
import enLocale from '@fullcalendar/core/locales/en-gb';
import esLocale from '@fullcalendar/core/locales/es';
import { DateClickArg } from '@fullcalendar/interaction';

import type { IDynamicTable } from '../../../components/shared/dynamic-tables.client';

const FullCalendar = dynamic(() => import('@fullcalendar/react'), { ssr: false });

// ─────────────────────────────────────────────────────────────
// Module-level constants
// ─────────────────────────────────────────────────────────────

const COLOR_BY_STATUS_DOT: Record<string, string> = {
    Scheduled: 'bg-blue-500',
    Completed: 'bg-emerald-500',
    'No-Show': 'bg-amber-500',
    Cancelled: 'bg-rose-500',
};

interface PlanningCalendarProps {
    events: { id: string; title: string; start?: string; end?: string; color?: string }[];
    onDateClick?: (dateStr: string, view: unknown) => void;
    onEventClick: (eventId: string) => void;
    records: { id: string; data?: Record<string, unknown> }[];
    tableData: IDynamicTable | null;
}

export function PlanningCalendar({
    events,
    onDateClick,
    onEventClick,
    records,
    tableData
}: PlanningCalendarProps) {
    const { t, i18n } = useTranslation(['common', 'database']);

    // Map i18next language to FullCalendar locale strings
    const lang = i18n.language || 'pt';
    const currentLocale = lang.startsWith('pt') ? 'pt-br' : lang.startsWith('es') ? 'es' : 'en-gb';

    const renderEventContent = useCallback((eventInfo: { event: { id: string; title: string }; view: { type: string } }) => {
        const eventId = eventInfo.event.id;
        const record = records?.find(r => r.id === eventId);
        if (!record || !tableData?.schema) {
            return (
                <div className="flex items-center w-full text-sm font-medium cursor-pointer truncate">
                    <span className="truncate">{eventInfo.event.title}</span>
                </div>
            );
        }

        const d = (record.data || {}) as Record<string, unknown>;
        const st = String(d.status || 'Scheduled');
        const dotCls = COLOR_BY_STATUS_DOT[st] || 'bg-blue-500';
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
            <div className="flex items-center w-full text-sm font-medium cursor-pointer">
                <span className="flex items-center gap-2 truncate">
                    <span className={`inline-flex w-2 h-2 rounded-full ${dotCls}`}></span>
                    <span className="truncate">{eventInfo.event.title}</span>
                </span>
            </div>
        );
    }, [records, tableData]);

    const handleDateClick = useCallback((arg: DateClickArg) => {
        if ((arg.jsEvent?.target as HTMLElement)?.closest('.fc-daygrid-more-link')) return; // handled by moreLinkClick
        const viewType = String(arg?.view?.type || '');
        // If clicking a date in month view -> Go to Day View
        if (viewType === 'dayGridMonth') {
            const calendarApi = arg.view.calendar;
            calendarApi.changeView('timeGridDay', arg.dateStr);
        }
        onDateClick?.(arg.dateStr, arg.view);
    }, [onDateClick]);

    return (
        <div className="bg-white dark:bg-neutral-800 rounded-2xl shadow-sm p-4 h-full min-h-[500px]">
            <style jsx global>{`
        /* FullCalendar v6 CSS variables - light */
        :root {
          --fc-page-bg-color: #ffffff;
          --fc-neutral-bg-color: #f8fafc;
          --fc-neutral-text-color: #64748b;
          --fc-border-color: #e5e7eb;
          --fc-button-text-color: #111827;
          --fc-button-bg-color: #f3f4f6;
          --fc-button-border-color: transparent;
          --fc-button-hover-bg-color: #e5e7eb;
          --fc-button-active-bg-color: #dbeafe;
          --fc-event-bg-color: #3b82f6;
          --fc-event-border-color: transparent;
          --fc-event-text-color: #ffffff;
          --fc-today-bg-color: rgba(59, 130, 246, 0.08);
          --fc-now-indicator-color: #ef4444;
        }
        /* FullCalendar v6 CSS variables - dark */
        .dark {
          --fc-page-bg-color: #0b1220;
          --fc-neutral-bg-color: #0f172a;
          --fc-neutral-text-color: #cbd5e1;
          --fc-border-color: #334155;
          --fc-button-text-color: #e5e7eb;
          --fc-button-bg-color: #1f2937;
          --fc-button-border-color: transparent;
          --fc-button-hover-bg-color: #374151;
          --fc-button-active-bg-color: #1d4ed8;
          --fc-event-bg-color: #3b82f6;
          --fc-event-border-color: transparent;
          --fc-event-text-color: #ffffff;
          --fc-today-bg-color: rgba(59, 130, 246, 0.15);
          --fc-now-indicator-color: #ef4444;
        }
        .fc .fc-theme-standard .fc-scrollgrid,
        .fc .fc-theme-standard td,
        .fc .fc-theme-standard th { border-color: #e5e7eb; }
        .dark .fc .fc-theme-standard .fc-scrollgrid,
        .dark .fc .fc-theme-standard td,
        .dark .fc .fc-theme-standard th { border-color: #374151; }
        .fc .fc-col-header-cell-cushion,
        .fc .fc-daygrid-day-number,
        .fc .fc-timegrid-axis-cushion,
        .fc .fc-timegrid-slot-label-cushion,
        .fc .fc-toolbar-title { color: #1f2937; }
        .dark .fc .fc-col-header-cell-cushion,
        .dark .fc .fc-daygrid-day-number,
        .dark .fc .fc-timegrid-axis-cushion,
        .dark .fc .fc-timegrid-slot-label-cushion,
        .dark .fc .fc-toolbar-title { color: #e5e7eb; }
        .fc .fc-day-today { background-color: rgba(59, 130, 246, 0.08); }
        .dark .fc .fc-day-today { background-color: rgba(59, 130, 246, 0.15); }
        .fc .fc-timegrid-slot { background-color: var(--fc-page-bg-color); height: 4.25rem; }
        .dark .fc .fc-timegrid-slot { background-color: var(--fc-page-bg-color); height: 4.25rem; }
        .fc .fc-timegrid-event { min-height: 2.25rem; display: flex; align-items: center; }
        .fc .fc-timegrid-event .fc-event-main { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; }
        .fc .fc-timegrid-now-indicator-line { border-color: #ef4444; }
        .fc .fc-timegrid-now-indicator-arrow { border-color: #ef4444 transparent transparent transparent; }
        .fc .fc-event { border: none; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.08); }
        .dark .fc .fc-event { box-shadow: 0 2px 10px rgba(0,0,0,0.35); }
        .fc .fc-daygrid-dot-event .fc-event-title { color: #ffffff; }
        .fc .fc-button { border: none; }
        .dark .fc-daygrid-more-link { color: #e5e7eb !important; }
        
        /* Custom Scrollbar for FullCalendar - matching globals.css */
        .fc-scroller::-webkit-scrollbar { width: 6px; height: 6px; }
        .fc-scroller::-webkit-scrollbar-track { background-color: transparent; border-radius: 3px; }
        .fc-scroller::-webkit-scrollbar-thumb { background-color: #d1d5db; border-radius: 3px; transition: background-color 0.2s ease; }
        .fc-scroller::-webkit-scrollbar-thumb:hover { background-color: #9ca3af; }
        .dark .fc-scroller::-webkit-scrollbar-thumb { background-color: #4b5563; }
        .dark .fc-scroller::-webkit-scrollbar-thumb:hover { background-color: #6b7280; }
        /* Firefox */
        .fc-scroller { scrollbar-width: thin; scrollbar-color: #d1d5db transparent; }
        .dark .fc-scroller { scrollbar-color: #4b5563 transparent; }
      `}</style>
            <FullCalendar
                plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
                height="100%"
                initialView="dayGridMonth"
                weekends={true}
                events={events}
                dateClick={handleDateClick}
                eventClick={(arg) => onEventClick(arg.event.id)}
                eventContent={renderEventContent}
                locales={[ptLocale, enLocale, esLocale]}
                locale={currentLocale}
                headerToolbar={{
                    left: 'prev,next today',
                    center: 'title',
                    right: 'dayGridMonth,timeGridWeek,timeGridDay'
                }}
                buttonText={{
                    today: t('common:today', 'Hoje'),
                    month: t('common:month', 'Mês'),
                    week: t('common:week', 'Semana'),
                    day: t('common:day', 'Dia')
                }}
                expandRows={true}
                displayEventTime={true}
                eventTimeFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
                eventColor={undefined}
                eventTextColor={'#ffffff'}
                eventClassNames={'border-none rounded-md text-sm font-medium cursor-pointer !text-white dark:!text-white group overflow-hidden px-2 py-1'}
                dayHeaderClassNames={'!border-b-0 text-sm font-medium text-gray-600 dark:text-gray-300 pb-2'}
                viewClassNames={'!border-0'}
                nowIndicator={true}
                navLinks={true}
                dayMaxEventRows={4}
                moreLinkContent={(arg: { num: number }) => `+${Number(arg?.num) || 0}x`}
                moreLinkClick="timeGridDay"
                slotMinTime={'07:00:00'}
                slotMaxTime={'21:00:00'}
                slotLabelInterval={{ hours: 1 }}
                slotDuration={'00:30:00'}
            />
        </div>
    );
}
