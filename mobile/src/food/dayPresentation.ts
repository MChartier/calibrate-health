import type { FoodLogDayStatus } from '@calibrate/api-client';

export function shouldShowCalorieComparison({
    status,
    isToday,
    hasFoodEntries
}: {
    status: FoodLogDayStatus | undefined;
    isToday: boolean;
    hasFoodEntries: boolean;
}) {
    if (status === 'COMPLETE') return true;
    return status === 'OPEN' && (isToday || hasFoodEntries);
}
