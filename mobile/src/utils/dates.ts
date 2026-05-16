import { formatDateOnlyInTimeZone } from '@calibrate/shared';

export function getTodayDate(timezone?: string | null): string {
    return formatDateOnlyInTimeZone(new Date(), timezone || 'UTC');
}
