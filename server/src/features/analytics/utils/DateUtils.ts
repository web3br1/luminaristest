/**
 * Analytics Date Utilities
 * 
 * Shared date manipulation functions for KPI processors (Timezone Safe).
 */
import { formatInTimeZone, toDate } from 'date-fns-tz';

/**
 * Returns a valid IANA timezone string. Falls back to 'UTC' if the supplied
 * value is empty, undefined, or not recognised by the Intl API.
 * This prevents an invalid x-user-timezone header from causing HTTP 500.
 */
function safeTimeZone(timeZone: string): string {
    if (!timeZone) return 'UTC';
    try {
        // Intl.DateTimeFormat throws a RangeError for unknown timezone identifiers.
        Intl.DateTimeFormat(undefined, { timeZone });
        return timeZone;
    } catch (_e) {
        return 'UTC';
    }
}

// Helper to construct an absolute Date object for a generic Timezone wall-clock
function createZonedDate(year: number, month: number, day: number, h: number, mn: number, s: number, ms: number, timeZone: string): Date {
    // Utilize Date.UTC for pure mathematical overflow/underflow normalization without local TZ corruption
    const norm = new Date(Date.UTC(year, month - 1, day, h, mn, s, ms));
    const ny = norm.getUTCFullYear();
    const nm = norm.getUTCMonth() + 1;
    const nd = norm.getUTCDate();
    const nh = norm.getUTCHours();
    const nmn = norm.getUTCMinutes();
    const ns = norm.getUTCSeconds();
    const nms = norm.getUTCMilliseconds();

    const pad = (n: number, w=2) => n.toString().padStart(w, '0');
    // Generates e.g. "2026-04-01T00:00:00.000"
    const isoString = `${ny}-${pad(nm)}-${pad(nd)}T${pad(nh)}:${pad(nmn)}:${pad(ns)}.${pad(nms, 3)}`;
    return toDate(isoString, { timeZone });
}

function getZonedParts(date: Date, timeZone: string) {
    const parseStr = (str: string) => {
        const [y, m, d, h, mn, s, ms, isoWeekday] = str.split('-');
        return {
            year: Number(y),
            month: Number(m),
            day: Number(d),
            hours: Number(h),
            minutes: Number(mn),
            seconds: Number(s),
            ms: Number(ms),
            isoWeekday: Number(isoWeekday) // 1=Mon, 7=Sun
        };
    };
    try {
        const str = formatInTimeZone(date, timeZone, 'yyyy-MM-dd-HH-mm-ss-SSS-i');
        return parseStr(str);
    } catch (e) {
        console.error(`Invalid time value in getZonedParts. date: ${date}, type: ${typeof date}, value: ${date?.getTime?.()}`);
        console.trace('Stack trace for Invalid Date:');
        throw new Error(`Invalid time value in getZonedParts. date: ${date}, timeZone: ${timeZone}`);
    }
}

/**
 * Counts the number of business days (Mon-Fri) in a specific month in a given TZ.
 * @param date Any date within the target month
 * @param timeZone Standard IANA TZ string
 * @returns Number of business days
 */
export function countBusinessDaysInMonth(date: Date, timeZone: string = 'UTC'): number {
    timeZone = safeTimeZone(timeZone);
    const parts = getZonedParts(date, timeZone);
    const currentMonth = parts.month;
    let count = 0;
    
    for (let day = 1; day <= 31; day++) {
        const iterDate = createZonedDate(parts.year, currentMonth, day, 12, 0, 0, 0, timeZone);
        const iterParts = getZonedParts(iterDate, timeZone);
        if (iterParts.month !== currentMonth) break;
        if (iterParts.isoWeekday !== 6 && iterParts.isoWeekday !== 7) count++;
    }
    
    return count || 1;
}

/**
 * Calculates the start date for a rolling window of months (TZ safe).
 */
export function getStartDateForMonthsWindow(now: Date, months: number, timeZone: string = 'UTC'): Date {
    timeZone = safeTimeZone(timeZone);
    const parts = getZonedParts(now, timeZone);
    let targetMonth = parts.month - (months - 1);
    let targetYear = parts.year;
    
    while (targetMonth <= 0) {
        targetMonth += 12;
        targetYear -= 1;
    }
    
    return createZonedDate(targetYear, targetMonth, 1, 0, 0, 0, 0, timeZone);
}

/**
 * Checks if a date falls within a specific window.
 */
export function isDateWithinWindow(date: Date | null, start: Date, end: Date): boolean {
    if (!date || !Number.isFinite(date.getTime())) return false;
    return date >= start && date <= end;
}

/**
 * Calculates the number of days between two dates.
 */
export function daysBetween(date1: Date, date2: Date): number {
    const diff = Math.abs(date2.getTime() - date1.getTime());
    return Math.floor(diff / (1000 * 60 * 60 * 24));
}

export type PeriodType = 'day' | 'week' | 'month' | 'quarter' | 'year';

export function getZonedPeriodKey(date: Date, period: PeriodType, timeZone: string = 'UTC'): string {
    timeZone = safeTimeZone(timeZone);
    const parts = getZonedParts(date, timeZone);
    const y = parts.year;
    const mStr = parts.month.toString().padStart(2, '0');
    
    switch (period) {
        case 'day':
            return `${y}-${mStr}-${parts.day.toString().padStart(2, '0')}`;
        case 'week': {
            // Simplified ISO week
            const firstJan = createZonedDate(y, 1, 1, 0, 0, 0, 0, timeZone);
            const days = Math.floor((date.getTime() - firstJan.getTime()) / 86400000);
            const firstJanIsoWday = getZonedParts(firstJan, timeZone).isoWeekday;
            const week = Math.ceil((days + firstJanIsoWday) / 7);
            return `${y}-W${week}`;
        }
        case 'quarter':
            return `${y}-Q${Math.floor((parts.month - 1) / 3) + 1}`;
        case 'year':
            return `${y}`;
        case 'month':
        default:
            return `${y}-${mStr}`;
    }
}

export type DatePreset = 'today' | 'thisWeek' | 'thisMonth' | 'lastMonth' | 'last30Days' | 'thisYear';

export interface PeriodBoundaries {
    currentStart: Date;
    currentEnd: Date;
    prevStart: Date;
    prevEnd: Date;
}

export function getPeriodBoundaries(preset: DatePreset | string, baseDate: Date = new Date(), timeZone: string = 'UTC'): PeriodBoundaries {
    timeZone = safeTimeZone(timeZone);
    const parts = getZonedParts(baseDate, timeZone);
    
    let curStartDay = parts.day;
    let curStartMonth = parts.month;
    let curStartYear = parts.year;
    
    let curEndDay = parts.day;
    let curEndMonth = parts.month;
    let curEndYear = parts.year;

    // Helper to shift month index safely
    const shiftMonth = (y: number, m: number, shift: number) => {
        let ny = y;
        let nm = m + shift;
        while (nm <= 0) {
            nm += 12;
            ny -= 1;
        }
        while (nm > 12) {
            nm -= 12;
            ny += 1;
        }
        return { y: ny, m: nm };
    };

    let prevStartDay = parts.day;
    let prevStartMonth = parts.month;
    let prevStartYear = parts.year;

    let prevEndDay = parts.day;
    let prevEndMonth = parts.month;
    let prevEndYear = parts.year;

    switch (preset) {
        case 'today':
            prevStartDay = parts.day - 1;
            prevEndDay = parts.day - 1;
            break;

        case 'thisWeek': {
            const indexDay = parts.isoWeekday === 7 ? 0 : parts.isoWeekday; 
            curStartDay = parts.day - indexDay;
            prevEndDay = curStartDay - 1;
            prevStartDay = prevEndDay - indexDay;
            break;
        }

        case 'thisMonth': {
            curStartDay = 1;
            const p = shiftMonth(parts.year, parts.month, -1);
            prevStartYear = p.y;
            prevStartMonth = p.m;
            prevStartDay = 1;

            prevEndYear = parts.year;
            prevEndMonth = parts.month; // 0th day of current month = end of previous month
            prevEndDay = 0; 
            break;
        }

        case 'lastMonth': {
            const p1 = shiftMonth(parts.year, parts.month, -1);
            curStartYear = p1.y;
            curStartMonth = p1.m;
            curStartDay = 1;
            curEndYear = parts.year;
            curEndMonth = parts.month; // 0th day of current month = end of last month
            curEndDay = 0;

            const p2 = shiftMonth(parts.year, parts.month, -2);
            prevStartYear = p2.y;
            prevStartMonth = p2.m;
            prevStartDay = 1;

            prevEndYear = p1.y;
            prevEndMonth = p1.m; // 0th day of last month = end of two months ago
            prevEndDay = 0;
            break;
        }

        case 'last30Days': {
            curStartDay = parts.day - 30;
            prevEndDay = curStartDay - 1;
            prevStartDay = prevEndDay - 30;
            break;
        }

        case 'thisYear': {
            curStartMonth = 1;
            curStartDay = 1;

            prevStartYear = parts.year - 1;
            prevStartMonth = 1;
            prevStartDay = 1;

            prevEndYear = parts.year - 1;
            prevEndMonth = parts.month;
            prevEndDay = parts.day;
            break;
        }

        default:
            curStartDay = 1;
            const pd = shiftMonth(parts.year, parts.month, -1);
            prevStartYear = pd.y;
            prevStartMonth = pd.m;
            prevStartDay = 1;
            prevEndYear = parts.year;
            prevEndMonth = parts.month;
            prevEndDay = 0;
            break;
    }

    const currentStart = createZonedDate(curStartYear, curStartMonth, curStartDay, 0, 0, 0, 0, timeZone);
    const currentEnd = createZonedDate(curEndYear, curEndMonth, curEndDay, 23, 59, 59, 999, timeZone);
    const prevStart = createZonedDate(prevStartYear, prevStartMonth, prevStartDay, 0, 0, 0, 0, timeZone);
    const prevEnd = createZonedDate(prevEndYear, prevEndMonth, prevEndDay, 23, 59, 59, 999, timeZone);

    return { currentStart, currentEnd, prevStart, prevEnd };
}
