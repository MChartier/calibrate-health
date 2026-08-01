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

export function shouldEmphasizePausedStatus({
    status,
    isToday,
    hasFoodEntries,
    isContentLoading
}: {
    status: FoodLogDayStatus | undefined;
    isToday: boolean;
    hasFoodEntries: boolean;
    isContentLoading: boolean;
}) {
    return status === 'PAUSED' && isToday && !hasFoodEntries && !isContentLoading;
}
