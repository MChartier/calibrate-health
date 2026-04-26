export type DailyCalorieStatus = 'onTrack' | 'warning' | 'over' | 'unknown';

export type DailyCalorieSummary = {
    totalCalories: number;
    dailyTarget: number | null;
    remainingCalories: number | null;
    status: DailyCalorieStatus;
    progressPercent: number;
};

const WARNING_REMAINING_RATIO = 0.15; // Remaining-target ratio where the day shifts from on-track to approaching limit.

/**
 * Compute Today workspace calorie status from logged calories and a target.
 */
export function getDailyCalorieSummary(totalCalories: number, dailyTarget: number | null | undefined): DailyCalorieSummary {
    if (typeof dailyTarget !== 'number' || !Number.isFinite(dailyTarget) || dailyTarget <= 0) {
        return {
            totalCalories,
            dailyTarget: null,
            remainingCalories: null,
            status: 'unknown',
            progressPercent: 0
        };
    }

    const roundedTarget = Math.round(dailyTarget);
    const remainingCalories = Math.round(roundedTarget - totalCalories);
    const progressPercent = Math.max(0, Math.min(100, (totalCalories / roundedTarget) * 100));

    let status: DailyCalorieStatus = 'onTrack';
    if (remainingCalories < 0) {
        status = 'over';
    } else if (remainingCalories <= roundedTarget * WARNING_REMAINING_RATIO) {
        status = 'warning';
    }

    return {
        totalCalories,
        dailyTarget: roundedTarget,
        remainingCalories,
        status,
        progressPercent
    };
}
