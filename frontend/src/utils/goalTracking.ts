import type { GoalMode } from './goalValidation';

const EM_DASH = '\u2014';

export type GoalProjection = {
    projectedDate: Date | null;
    projectedDateLabel: string;
    detail: string | null;
};

/**
 * Parse a Postgres DATE-ish string into a local Date at midnight.
 *
 * The backend stores weights as date-only values; converting to a local Date
 * avoids the chart rendering the point on the previous/next day due to timezone offsets.
 */
export function parseDateOnlyToLocalDate(value: string): Date | null {
    const datePart = value.split('T')[0] ?? '';
    const [yearString, monthString, dayString] = datePart.split('-');
    const year = Number(yearString);
    const month = Number(monthString);
    const day = Number(dayString);

    if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
        return null;
    }

    return new Date(year, month - 1, day);
}

/**
 * Format a date-like string for display, falling back to an em dash for invalid inputs.
 */
export function formatDateLabel(value: string | null | undefined): string {
    if (!value) return EM_DASH;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return EM_DASH;
    return new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric' }).format(parsed);
}

/**
 * Format a Date instance for display, falling back to an em dash for null/invalid dates.
 */
export function formatDateValue(value: Date | null | undefined): string {
    if (!value) return EM_DASH;
    if (Number.isNaN(value.getTime())) return EM_DASH;
    return new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric' }).format(value);
}

/**
 * Parse an ISO-like timestamp into a Date, returning null for invalid input.
 */
export function parseDateTime(value: string | null | undefined): Date | null {
    if (!value) return null;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Convert a Date into local "start of day" to keep date math stable for UI display.
 */
export function startOfLocalDay(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * Add a number of days to a date without mutating the input.
 */
export function addDays(date: Date, days: number): Date {
    const next = new Date(date);
    next.setDate(next.getDate() + days);
    return next;
}

/**
 * Format the user's goal calorie change with an explicit sign:
 * - deficit => "-500 kcal/day"
 * - surplus => "+500 kcal/day"
 * - maintenance => "0 kcal/day"
 */
export function formatDailyCalorieChange(dailyDeficit: number): string {
    if (dailyDeficit === 0) return '0 kcal/day';
    const sign = dailyDeficit > 0 ? '-' : '+';
    return `${sign}${Math.abs(dailyDeficit)} kcal/day`;
}

/**
 * Round a numeric weight to one decimal place (matches backend storage).
 */
export function roundWeight(value: number): number {
    return Math.round(value * 10) / 10;
}

/**
 * Derive the goal mode from the stored daily calorie delta.
 *
 * Backend convention:
 * - positive daily_deficit => lose weight (deficit)
 * - zero daily_deficit => maintain weight
 * - negative daily_deficit => gain weight (surplus)
 */
export function getGoalModeFromDailyDeficit(dailyDeficit: number): GoalMode {
    if (dailyDeficit === 0) return 'maintain';
    return dailyDeficit > 0 ? 'lose' : 'gain';
}

/**
 * Choose a reasonable "on target" tolerance for maintenance goals.
 *
 * Rationale: daily weigh-ins fluctuate; we avoid declaring success/failure on tiny changes.
 */
export function getMaintenanceTolerance(unitLabel: string): number {
    return unitLabel === 'lb' ? 1 : 0.5;
}

/**
 * Compute goal progress and completion based on start/target/current.
 *
 * We treat "met or exceeded" as (for change goals):
 * - loss goal (target < start): current <= target
 * - gain goal (target > start): current >= target
 */
export function computeGoalProgress(opts: {
    startWeight: number;
    targetWeight: number;
    currentWeight: number;
}): { percent: number; isComplete: boolean } {
    const { startWeight, targetWeight, currentWeight } = opts;

    const totalDelta = targetWeight - startWeight;
    const achievedDelta = currentWeight - startWeight;

    if (totalDelta === 0) {
        const epsilon = 0.1;
        const isComplete = Math.abs(currentWeight - targetWeight) <= epsilon;
        return { percent: isComplete ? 100 : 0, isComplete };
    }

    const raw = (achievedDelta / totalDelta) * 100;
    const percent = Math.max(0, Math.min(100, raw));
    const isComplete = totalDelta > 0 ? currentWeight >= targetWeight : currentWeight <= targetWeight;

    return { percent, isComplete };
}

/**
 * Project a target date using the constant-rate model (3500 kcal/lb or 7700 kcal/kg).
 *
 * For non-maintenance goals, we estimate time-to-goal from the best-known baseline:
 * - latest weigh-in (preferred)
 * - otherwise, the goal's start weight on the goal's created date
 */
export function computeGoalProjection(opts: {
    goalMode: GoalMode;
    unitLabel: string;
    startWeight: number;
    targetWeight: number;
    dailyDeficit: number;
    goalCreatedAt: string | null;
    currentWeight: number | null;
    currentWeightDate: string | null;
}): GoalProjection {
    const {
        goalMode,
        unitLabel,
        startWeight,
        targetWeight,
        dailyDeficit,
        goalCreatedAt,
        currentWeight,
        currentWeightDate
    } = opts;

    if (goalMode === 'maintain' || dailyDeficit === 0) {
        return {
            projectedDate: null,
            projectedDateLabel: EM_DASH,
            detail: 'No target date projection for maintenance goals.'
        };
    }

    const caloriesPerUnit = unitLabel === 'lb' ? 3500 : 7700;
    const baselineWeight = typeof currentWeight === 'number' && Number.isFinite(currentWeight) ? currentWeight : startWeight;

    const baselineDate =
        currentWeightDate ? parseDateOnlyToLocalDate(currentWeightDate) : startOfLocalDay(parseDateTime(goalCreatedAt) ?? new Date());

    if (!baselineDate) {
        return {
            projectedDate: null,
            projectedDateLabel: EM_DASH,
            detail: 'Unable to compute a projection date right now.'
        };
    }

    const paceLabel = formatDailyCalorieChange(dailyDeficit);

    // Validate that the calorie direction matches the *goal definition* (start -> target).
    // This avoids mislabeling "overshot" goals as invalid when the current weight is beyond the target.
    if (dailyDeficit > 0 && targetWeight > startWeight) {
        return {
            projectedDate: null,
            projectedDateLabel: EM_DASH,
            detail: `Projection unavailable: ${paceLabel} implies weight loss, but your target is above your start weight.`
        };
    }
    if (dailyDeficit < 0 && targetWeight < startWeight) {
        return {
            projectedDate: null,
            projectedDateLabel: EM_DASH,
            detail: `Projection unavailable: ${paceLabel} implies weight gain, but your target is below your start weight.`
        };
    }

    const remaining =
        dailyDeficit > 0
            ? Math.max(0, baselineWeight - targetWeight)
            : Math.max(0, targetWeight - baselineWeight);

    const daysToTarget = remaining === 0 ? 0 : Math.ceil((remaining * caloriesPerUnit) / Math.abs(dailyDeficit));
    const projectedDate = addDays(baselineDate, daysToTarget);
    const baselineLabel = currentWeightDate ? `from your latest weigh-in (${formatDateValue(baselineDate)})` : 'from your goal start';

    return {
        projectedDate,
        projectedDateLabel: formatDateValue(projectedDate),
        detail: `Based on ${paceLabel} ${baselineLabel}.`
    };
}

