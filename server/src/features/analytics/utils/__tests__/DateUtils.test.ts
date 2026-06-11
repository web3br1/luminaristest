/**
 * Tests for DateUtils — focusing on timezone handling and the UTC fallback
 * introduced to prevent HTTP 500 responses when x-user-timezone is invalid (R17).
 */
import {
    countBusinessDaysInMonth,
    getStartDateForMonthsWindow,
    getZonedPeriodKey,
    getPeriodBoundaries,
} from '../DateUtils';

const referenceDate = new Date('2026-04-15T12:00:00Z');

describe('DateUtils — timezone handling', () => {
    describe('countBusinessDaysInMonth', () => {
        it('returns a valid count for America/Sao_Paulo', () => {
            const result = countBusinessDaysInMonth(referenceDate, 'America/Sao_Paulo');
            expect(typeof result).toBe('number');
            expect(result).toBeGreaterThan(0);
        });

        it('returns a valid count for UTC', () => {
            const result = countBusinessDaysInMonth(referenceDate, 'UTC');
            expect(typeof result).toBe('number');
            expect(result).toBeGreaterThan(0);
        });

        it('does not throw for InvalidTimezone/Garbage — returns UTC-based result', () => {
            expect(() => countBusinessDaysInMonth(referenceDate, 'InvalidTimezone/Garbage')).not.toThrow();
            const result = countBusinessDaysInMonth(referenceDate, 'InvalidTimezone/Garbage');
            const utcResult = countBusinessDaysInMonth(referenceDate, 'UTC');
            expect(result).toBe(utcResult);
        });

        it('does not throw for empty string — returns UTC-based result', () => {
            expect(() => countBusinessDaysInMonth(referenceDate, '')).not.toThrow();
            const result = countBusinessDaysInMonth(referenceDate, '');
            const utcResult = countBusinessDaysInMonth(referenceDate, 'UTC');
            expect(result).toBe(utcResult);
        });
    });

    describe('getStartDateForMonthsWindow', () => {
        it('returns a valid Date for America/Sao_Paulo', () => {
            const result = getStartDateForMonthsWindow(referenceDate, 3, 'America/Sao_Paulo');
            expect(result).toBeInstanceOf(Date);
            expect(Number.isFinite(result.getTime())).toBe(true);
        });

        it('returns a valid Date for UTC', () => {
            const result = getStartDateForMonthsWindow(referenceDate, 3, 'UTC');
            expect(result).toBeInstanceOf(Date);
            expect(Number.isFinite(result.getTime())).toBe(true);
        });

        it('does not throw for InvalidTimezone/Garbage — returns UTC-based result', () => {
            expect(() => getStartDateForMonthsWindow(referenceDate, 3, 'InvalidTimezone/Garbage')).not.toThrow();
            const result = getStartDateForMonthsWindow(referenceDate, 3, 'InvalidTimezone/Garbage');
            const utcResult = getStartDateForMonthsWindow(referenceDate, 3, 'UTC');
            expect(result.getTime()).toBe(utcResult.getTime());
        });

        it('does not throw for empty string — returns UTC-based result', () => {
            expect(() => getStartDateForMonthsWindow(referenceDate, 3, '')).not.toThrow();
            const result = getStartDateForMonthsWindow(referenceDate, 3, '');
            const utcResult = getStartDateForMonthsWindow(referenceDate, 3, 'UTC');
            expect(result.getTime()).toBe(utcResult.getTime());
        });
    });

    describe('getZonedPeriodKey', () => {
        it('returns a valid key for America/Sao_Paulo', () => {
            const result = getZonedPeriodKey(referenceDate, 'month', 'America/Sao_Paulo');
            expect(typeof result).toBe('string');
            expect(result).toMatch(/^\d{4}-\d{2}$/);
        });

        it('returns a valid key for UTC', () => {
            const result = getZonedPeriodKey(referenceDate, 'month', 'UTC');
            expect(result).toBe('2026-04');
        });

        it('does not throw for InvalidTimezone/Garbage — returns UTC-based result', () => {
            expect(() => getZonedPeriodKey(referenceDate, 'month', 'InvalidTimezone/Garbage')).not.toThrow();
            const result = getZonedPeriodKey(referenceDate, 'month', 'InvalidTimezone/Garbage');
            const utcResult = getZonedPeriodKey(referenceDate, 'month', 'UTC');
            expect(result).toBe(utcResult);
        });

        it('does not throw for empty string — returns UTC-based result', () => {
            expect(() => getZonedPeriodKey(referenceDate, 'month', '')).not.toThrow();
            const result = getZonedPeriodKey(referenceDate, 'month', '');
            const utcResult = getZonedPeriodKey(referenceDate, 'month', 'UTC');
            expect(result).toBe(utcResult);
        });
    });

    describe('getPeriodBoundaries', () => {
        it('returns valid boundaries for America/Sao_Paulo', () => {
            const result = getPeriodBoundaries('thisMonth', referenceDate, 'America/Sao_Paulo');
            expect(result.currentStart).toBeInstanceOf(Date);
            expect(result.currentEnd).toBeInstanceOf(Date);
            expect(Number.isFinite(result.currentStart.getTime())).toBe(true);
            expect(Number.isFinite(result.currentEnd.getTime())).toBe(true);
        });

        it('returns valid boundaries for UTC', () => {
            const result = getPeriodBoundaries('thisMonth', referenceDate, 'UTC');
            expect(result.currentStart).toBeInstanceOf(Date);
            expect(Number.isFinite(result.currentStart.getTime())).toBe(true);
        });

        it('does not throw for InvalidTimezone/Garbage — returns UTC-based result', () => {
            expect(() => getPeriodBoundaries('thisMonth', referenceDate, 'InvalidTimezone/Garbage')).not.toThrow();
            const result = getPeriodBoundaries('thisMonth', referenceDate, 'InvalidTimezone/Garbage');
            const utcResult = getPeriodBoundaries('thisMonth', referenceDate, 'UTC');
            expect(result.currentStart.getTime()).toBe(utcResult.currentStart.getTime());
            expect(result.currentEnd.getTime()).toBe(utcResult.currentEnd.getTime());
        });

        it('does not throw for empty string — returns UTC-based result', () => {
            expect(() => getPeriodBoundaries('thisMonth', referenceDate, '')).not.toThrow();
            const result = getPeriodBoundaries('thisMonth', referenceDate, '');
            const utcResult = getPeriodBoundaries('thisMonth', referenceDate, 'UTC');
            expect(result.currentStart.getTime()).toBe(utcResult.currentStart.getTime());
        });
    });
});
