import type { FoodLogDay } from '@calibrate/api-client';

export type FoodDayCalendarMarker = 'complete-target' | 'complete-between' | 'complete-beyond' | 'complete-unavailable' | 'incomplete' | 'not-started' | 'paused' | 'none';

export const foodDayRangeQueryRoot = ['mobile-food-days'] as const;

export function foodDayRangeQueryKey(startDate: string, endDate: string) {
    return [...foodDayRangeQueryRoot, startDate, endDate] as const;
}

export function getFoodDayCalendarMarker(
    day: FoodLogDay | undefined,
    today: string
): FoodDayCalendarMarker {
    if (!day) return 'none';
    if (day.status === 'COMPLETE') {
        const comparison = day.calorie_comparison;
        if (!comparison) return 'complete-unavailable';
        const { consumed_kcal: consumed, target_kcal: target, maintenance_kcal: maintenance, captured_at: captured } = comparison;
        if (!Number.isSafeInteger(consumed) || consumed < 0 ||
            !Number.isSafeInteger(target) || target <= 0 ||
            !Number.isSafeInteger(maintenance) || maintenance <= 0 ||
            typeof captured !== 'string' || !Number.isFinite(Date.parse(captured))) return 'complete-unavailable';
        if (target > maintenance) {
            if (consumed >= target) return 'complete-target';
            return consumed >= maintenance ? 'complete-between' : 'complete-beyond';
        }
        if (consumed <= target) return 'complete-target';
        return consumed <= maintenance ? 'complete-between' : 'complete-beyond';
    }
    if (day.status === 'PAUSED') return 'paused';
    if (day.source === 'INFERRED_EMPTY' || day.source === 'BEFORE_TRACKING_START') {
        return 'not-started';
    }
    if (day.status === 'INCOMPLETE') return 'incomplete';
    if (day.date < today && day.status === 'OPEN') return 'incomplete';
    return 'none';
}

export function getFoodDayCalendarLabel(day: FoodLogDay | undefined, today: string): string {
    const marker = getFoodDayCalendarMarker(day, today);
    const gain = (day?.calorie_comparison?.target_kcal ?? 0) > (day?.calorie_comparison?.maintenance_kcal ?? 0);
    switch (marker) {
        case 'complete-target': return gain ? 'completed, at or above target' : 'completed, at or below target';
        case 'complete-between': return gain
            ? 'completed, below target, at or above maintenance'
            : 'completed, above target, at or below maintenance';
        case 'complete-beyond': return gain ? 'completed, below maintenance' : 'completed, above maintenance';
        case 'complete-unavailable': return 'completed, comparison unavailable';
        case 'incomplete': return 'incomplete';
        case 'not-started': return 'not started';
        case 'paused': return 'tracking paused';
        default: return 'in progress';
    }
}

export function getMonthKey(date: string): string {
    return date.slice(0, 7);
}

export function shiftMonth(monthKey: string, offset: number): string {
    const [yearString, monthString] = monthKey.split('-');
    const date = new Date(Date.UTC(Number(yearString), Number(monthString) - 1 + offset, 1));
    return date.toISOString().slice(0, 7);
}

export function getCalendarMonthRange(monthKey: string, minDate: string, maxDate: string) {
    const [yearString, monthString] = monthKey.split('-');
    const year = Number(yearString);
    const month = Number(monthString);
    const monthStart = `${monthKey}-01`;
    const monthEnd = new Date(Date.UTC(year, month, 0)).toISOString().slice(0, 10);
    return {
        startDate: monthStart < minDate ? minDate : monthStart,
        endDate: monthEnd > maxDate ? maxDate : monthEnd
    };
}

export function getCalendarWeeks(monthKey: string): Array<Array<string | null>> {
    const [yearString, monthString] = monthKey.split('-');
    const year = Number(yearString);
    const month = Number(monthString);
    const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const cellCount = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;
    const cells = Array.from({ length: cellCount }, (_, index) => {
        const day = index - firstWeekday + 1;
        if (day < 1 || day > daysInMonth) return null;
        return `${monthKey}-${String(day).padStart(2, '0')}`;
    });

    return Array.from({ length: cellCount / 7 }, (_, index) => cells.slice(index * 7, index * 7 + 7));
}
