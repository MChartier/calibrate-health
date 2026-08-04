import type { GoalEntry, MetricEntry } from '@calibrate/api-client';
import { ALLOWED_DAILY_DEFICIT_ABS_VALUES, type WeightUnit } from '@calibrate/shared';
import { getLocalDateForTimestamp } from './dates';
import { formatCalories, formatWeight } from './format';
import { getMetricDate } from './metrics';

export type GoalMode = 'lose' | 'maintain' | 'gain';

export const GOAL_MODE_OPTIONS: Array<{ value: GoalMode; label: string }> = [
    { value: 'lose', label: 'Lose' },
    { value: 'maintain', label: 'Maintain' },
    { value: 'gain', label: 'Gain' }
];

export const DAILY_GOAL_CHANGE_OPTIONS = ALLOWED_DAILY_DEFICIT_ABS_VALUES.filter((value) => value !== 0);

const CALORIES_PER_POUND = 3500;
const CALORIES_PER_KILOGRAM = 7700;

export function getGoalModeFromDailyDeficit(dailyDeficit: number | null | undefined): GoalMode {
    if (typeof dailyDeficit !== 'number' || dailyDeficit === 0) return 'maintain';
    return dailyDeficit > 0 ? 'lose' : 'gain';
}

export function getSignedDailyDeficit(goalMode: GoalMode, dailyChangeAbs: string): number {
    if (goalMode === 'maintain') return 0;
    const magnitude = Math.abs(Number(dailyChangeAbs));
    return goalMode === 'gain' ? -magnitude : magnitude;
}

/** Maintenance starts from the current weight; other modes preserve the user's target draft. */
export function getTargetWeightAfterGoalModeChange(
    goalMode: GoalMode,
    startWeight: string,
    currentTargetWeight: string
): string {
    return goalMode === 'maintain' ? startWeight : currentTargetWeight;
}

export function getDailyGoalChangeCopy(
    goalMode: Exclude<GoalMode, 'maintain'>,
    value: string
): { label: string; description: string } {
    const magnitude = Math.abs(Number(value));
    const formatted = Number.isFinite(magnitude) ? magnitude.toLocaleString() : value;
    if (goalMode === 'gain') {
        return {
            label: `${formatted} kcal/day surplus`,
            description: `Targets eating ${formatted} kcal above estimated burn.`
        };
    }
    return {
        label: `${formatted} kcal/day deficit`,
        description: `Targets eating ${formatted} kcal below estimated burn.`
    };
}

export function formatDailyGoalChange(signedDailyDeficit: number): string {
    if (signedDailyDeficit === 0) return 'Maintenance';
    const direction = signedDailyDeficit > 0 ? 'deficit' : 'surplus';
    return `${formatCalories(Math.abs(signedDailyDeficit))}/day ${direction}`;
}

export function formatGoalSummary(goal: GoalEntry | null | undefined, weightUnit: WeightUnit | undefined): string {
    if (!goal) return 'No active goal set';

    const target = formatWeight(goal.target_weight, weightUnit);
    const magnitude = Math.abs(goal.daily_deficit).toLocaleString();
    if (goal.daily_deficit > 0) return `Lose to ${target} | ${magnitude} kcal/day deficit`;
    if (goal.daily_deficit < 0) return `Gain to ${target} | ${magnitude} kcal/day surplus`;
    return `Maintain around ${target}`;
}

export function computeGoalProgress(args: {
    startWeight: number;
    targetWeight: number;
    currentWeight: number | null;
}): { percent: number; isComplete: boolean } | null {
    const { startWeight, targetWeight, currentWeight } = args;
    if (typeof currentWeight !== 'number' || !Number.isFinite(currentWeight)) return null;

    const totalDelta = targetWeight - startWeight;
    const achievedDelta = currentWeight - startWeight;
    if (totalDelta === 0) return null;

    const percent = Math.max(0, Math.min(100, (achievedDelta / totalDelta) * 100));
    const isComplete = totalDelta > 0 ? currentWeight >= targetWeight : currentWeight <= targetWeight;
    return { percent, isComplete };
}

/** Goal completion is durable once a goal-period weigh-in reaches a loss or gain target. */
export function getGoalReachedDate(args: {
    goal: GoalEntry;
    metrics: ReadonlyArray<MetricEntry>;
    timezone?: string | null;
}): string | null {
    const { goal, metrics, timezone } = args;
    const mode = getGoalModeFromDailyDeficit(goal.daily_deficit);
    if (mode === 'maintain') return null;

    const goalStartDate = getLocalDateForTimestamp(goal.created_at, timezone);
    const reachedMetric = metrics
        .filter((metric) => {
            if (!Number.isFinite(metric.weight)) return false;
            const metricDate = getMetricDate(metric);
            if (goalStartDate && metricDate < goalStartDate) return false;
            return mode === 'lose'
                ? metric.weight <= goal.target_weight
                : metric.weight >= goal.target_weight;
        })
        .sort((left, right) => getMetricDate(left).localeCompare(getMetricDate(right)))[0];

    return reachedMetric ? getMetricDate(reachedMetric) : null;
}

export function computeGoalProjection(args: {
    targetWeight: number;
    currentWeight: number | null;
    startWeight: number;
    dailyDeficit: number;
    unitLabel: string;
}): string {
    const { dailyDeficit, targetWeight, currentWeight, startWeight, unitLabel } = args;
    if (dailyDeficit === 0) return 'No projection for maintenance.';

    const baseline = typeof currentWeight === 'number' && Number.isFinite(currentWeight) ? currentWeight : startWeight;
    const remaining = dailyDeficit > 0 ? Math.max(0, baseline - targetWeight) : Math.max(0, targetWeight - baseline);
    const caloriesPerUnit = unitLabel === 'lb' ? CALORIES_PER_POUND : CALORIES_PER_KILOGRAM;
    const days = remaining === 0 ? 0 : Math.ceil((remaining * caloriesPerUnit) / Math.abs(dailyDeficit));
    const projected = new Date();
    projected.setDate(projected.getDate() + days);
    return new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(projected);
}
