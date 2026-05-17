import { formatDateOnlyInTimeZone } from '@calibrate/shared';

export function getTodayDate(timezone?: string | null): string {
    return formatDateOnlyInTimeZone(new Date(), timezone || 'UTC');
}

export function getLocalDateForTimestamp(timestamp: string | null | undefined, timezone?: string | null): string | null {
    if (!timestamp) return null;
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return null;
    return formatDateOnlyInTimeZone(date, timezone || 'UTC');
}

export function addDaysToDateOnly(value: string, days: number): string {
    const [yearString, monthString, dayString] = value.split('-');
    const year = Number(yearString);
    const month = Number(monthString);
    const day = Number(dayString);
    const date = new Date(Date.UTC(year, month - 1, day));
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
}

export function dateOnlyToLocalDate(value: string): Date {
    const [yearString, monthString, dayString] = value.split('-');
    return new Date(Number(yearString), Number(monthString) - 1, Number(dayString));
}

export function localDateToDateOnly(value: Date): string {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

export function clampDateOnly(value: string, min: string, max: string): string {
    if (value < min) return min;
    if (value > max) return max;
    return value;
}

export function formatDateOnlyForDisplay(value: string): string {
    const [yearString, monthString, dayString] = value.split('-');
    const year = Number(yearString);
    const month = Number(monthString);
    const day = Number(dayString);
    const date = new Date(year, month - 1, day);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
}
