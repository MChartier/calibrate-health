/**
 * Standard allowed daily calorie deficit/surplus magnitudes (kcal/day).
 *
 * We constrain these values to keep goal projections stable and avoid extreme plans.
 */
export const ALLOWED_DAILY_DEFICIT_ABS_VALUES = new Set([0, 250, 500, 750, 1000]);

/**
 * Parse and validate the goal calorie change.
 *
 * Convention:
 * - positive => deficit (lose weight)
 * - zero => maintenance
 * - negative => surplus (gain weight)
 *
 * Only allows standard deficit/surplus magnitudes to keep projections stable.
 */
export function parseDailyDeficit(input: unknown): number | null {
    const numeric = typeof input === 'number' ? input : typeof input === 'string' ? Number(input) : Number.NaN;
    if (!Number.isFinite(numeric) || !Number.isInteger(numeric)) {
        return null;
    }

    const absValue = Math.abs(numeric);
    if (!ALLOWED_DAILY_DEFICIT_ABS_VALUES.has(absValue)) {
        return null;
    }

    return numeric;
}

