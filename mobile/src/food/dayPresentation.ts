import type { FoodLogDayStatus } from '@calibrate/api-client';

export type FoodDayStatusLabel = 'Fully logged' | 'Not fully logged' | 'Paused';

export function getFoodDayStatusLabel({
    status,
    failed = false
}: {
    status: FoodLogDayStatus | undefined;
    failed?: boolean;
}): FoodDayStatusLabel {
    if (status === 'PAUSED') return 'Paused';
    if (failed) return 'Not fully logged';
    if (status === 'COMPLETE') return 'Fully logged';
    return 'Not fully logged';
}
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
