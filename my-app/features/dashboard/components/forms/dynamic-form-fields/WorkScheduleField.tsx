import React from 'react';
import { useTranslation } from 'next-i18next';

type DayKey = 'monday'|'tuesday'|'wednesday'|'thursday'|'friday'|'saturday'|'sunday';

interface WorkSchedule {
  [key: string]: { active?: boolean; start?: string; end?: string } | undefined;
}

interface WorkScheduleFieldProps {
  name: string;
  value: unknown;
  onChange: (name: string, value: unknown) => void;
  className?: string;
  required?: boolean;
}

function normalize(value: unknown): WorkSchedule {
  if (value && typeof value === 'object' && !Array.isArray(value)) return { ...value } as WorkSchedule;
  return {} as WorkSchedule;
}

function WorkScheduleField({ name, value, onChange }: WorkScheduleFieldProps) {
  const { t } = useTranslation(['common']);
  const schedule = normalize(value);

  const dayLabels: Record<DayKey, string> = {
    monday:    t('days.monday',    'Monday'),
    tuesday:   t('days.tuesday',   'Tuesday'),
    wednesday: t('days.wednesday', 'Wednesday'),
    thursday:  t('days.thursday',  'Thursday'),
    friday:    t('days.friday',    'Friday'),
    saturday:  t('days.saturday',  'Saturday'),
    sunday:    t('days.sunday',    'Sunday'),
  };

  function updateDay(day: DayKey, patch: { active?: boolean; start?: string; end?: string }) {
    const next: WorkSchedule = { ...schedule, [day]: { ...(schedule[day] || {}), ...patch } };
    onChange(name, next);
  }

  function applyWeekdaysDefault() {
    const next: WorkSchedule = { ...schedule };
    (['monday','tuesday','wednesday','thursday','friday'] as DayKey[]).forEach((d) => {
      next[d] = { active: true, start: '09:00', end: '18:00' };
    });
    onChange(name, next);
  }

  function clearAll() {
    onChange(name, {});
  }

  return (
    <div className="rounded-xl border border-gray-200/70 dark:border-gray-700 p-4 bg-white dark:bg-neutral-900/60">
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs text-gray-700 dark:text-gray-200">{t('schedule.instructions', 'Set working hours per day')}</div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={applyWeekdaysDefault} className="px-2 py-1 rounded-lg bg-gray-100 dark:bg-neutral-800 text-gray-800 dark:text-gray-100 text-xs hover:bg-gray-200 dark:hover:bg-gray-700">{t('schedule.weekdays_preset', 'Mon-Fri 09:00\u201318:00')}</button>
          <button type="button" onClick={clearAll} className="px-2 py-1 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-200 text-xs hover:bg-red-100 dark:hover:bg-red-900/30">{t('schedule.clear', 'Clear')}</button>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 max-h-[420px] overflow-y-auto custom-scrollbar dark:custom-scrollbar">
        {(['monday','tuesday','wednesday','thursday','friday','saturday','sunday'] as DayKey[]).map((day) => {
          const row = schedule[day] || {};
          return (
            <div key={day} className="grid grid-cols-12 gap-3 items-center">
              <div className="col-span-5 text-sm text-gray-900 dark:text-gray-100 flex items-center gap-3">
                <label className="relative inline-flex items-center cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={!!row.active}
                    onChange={(e) => updateDay(day, { active: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 dark:bg-gray-700 rounded-full peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-500 transition-colors peer-checked:bg-blue-600"></div>
                  <div className="absolute left-0.5 top-0.5 w-5 h-5 bg-white rounded-full shadow transform transition-transform peer-checked:translate-x-5"></div>
                </label>
                <span>{dayLabels[day]}</span>
              </div>
              <div className="col-span-3">
                <input
                  type="time"
                  value={row.start || ''}
                  onChange={(e) => updateDay(day, { start: e.target.value })}
                  placeholder={t('schedule.start_time', 'Start')}
                  className="mt-0 block w-full px-3 py-2 bg-white dark:bg-neutral-900/60 border border-gray-200/70 dark:border-gray-700 rounded-xl text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              <div className="col-span-4">
                <input
                  type="time"
                  value={row.end || ''}
                  onChange={(e) => updateDay(day, { end: e.target.value })}
                  placeholder={t('schedule.end_time', 'End')}
                  className="mt-0 block w-full px-3 py-2 bg-white dark:bg-neutral-900/60 border border-gray-200/70 dark:border-gray-700 rounded-xl text-sm text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default WorkScheduleField;
