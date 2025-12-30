import type { WeightUnit } from '../context/authContext';
import type { GoalMode } from './goalValidation';

/**
 * Parse a user-entered numeric string into a finite number.
 *
 * Returns null for empty/invalid inputs so callers can safely skip conversions.
 */
export function parseFiniteNumber(value: string): number | null {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Format a numeric value with a fixed number of decimals, trimming trailing zeros.
 */
export function formatNumber(value: number, decimals: number): string {
    const fixed = value.toFixed(decimals);
    return fixed.replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');
}

/**
 * Convert centimeters to a {feet, inches} pair, rounding inches to 0.1 to match our input step.
 */
export function convertCmToFeetInches(cm: number): { feet: number; inches: number } {
    const totalInches = cm / 2.54;
    const feet = Math.floor(totalInches / 12);
    const rawInches = totalInches - feet * 12;
    const inches = Math.round(rawInches * 10) / 10;

    // Handle edge-case rounding that would spill into the next foot (e.g. 11.96" -> 12.0").
    if (inches >= 12) {
        return { feet: feet + 1, inches: 0 };
    }

    return { feet, inches };
}

/**
 * Convert a {feet, inches} pair into centimeters, rounding to 0.1 cm for a stable display value.
 */
export function convertFeetInchesToCm(feet: number, inches: number): number {
    const totalInches = feet * 12 + inches;
    const cm = totalInches * 2.54;
    return Math.round(cm * 10) / 10;
}

/**
 * Convert between kg and lb for onboarding inputs (rounded to 0.1 to match our weight step).
 */
export function convertWeight(value: number, from: WeightUnit, to: WeightUnit): number {
    if (from === to) return value;

    const KG_TO_LB = 2.2046226218;
    const converted = from === 'KG' ? value * KG_TO_LB : value / KG_TO_LB;
    return Math.round(converted * 10) / 10;
}

/**
 * Convert a user-entered weight string between units.
 *
 * Returns the original string when it can't be parsed so we don't delete partially-entered input.
 */
export function convertWeightInputString(value: string, from: WeightUnit, to: WeightUnit): string {
    const parsed = parseFiniteNumber(value);
    if (parsed === null) return value;
    return formatNumber(convertWeight(parsed, from, to), 1);
}

/**
 * Convert a cm input string into ft/in strings for our split height fields.
 *
 * Returns empty strings when the value can't be parsed.
 */
export function convertHeightCmStringToFeetInches(value: string): { feet: string; inches: string } {
    const parsed = parseFiniteNumber(value);
    if (parsed === null) return { feet: '', inches: '' };

    const converted = convertCmToFeetInches(parsed);
    return {
        feet: String(converted.feet),
        inches: formatNumber(converted.inches, 1)
    };
}

/**
 * Convert ft/in input strings into a cm string for our single-field height input.
 *
 * Returns an empty string when feet is missing/invalid so callers can keep the cm field blank.
 */
export function convertHeightFeetInchesStringsToCm(feet: string, inches: string): string {
    const parsedFeet = parseFiniteNumber(feet);
    if (parsedFeet === null) return '';
    const parsedInches = parseFiniteNumber(inches) ?? 0;
    return formatNumber(convertFeetInchesToCm(parsedFeet, parsedInches), 1);
}

/**
 * Estimate the weekly weight change implied by a daily calorie deficit/surplus.
 *
 * Uses our MVP projection constants (3500 kcal/lb and 7700 kcal/kg). This is intentionally
 * a rough heuristic to help users pick a pace; it is not meant to be medically prescriptive.
 */
export function formatWeeklyWeightChange(opts: {
    goalMode: GoalMode;
    dailyCaloriesAbs: number;
    weightUnit: WeightUnit;
}): string {
    const caloriesPerUnit = opts.weightUnit === 'LB' ? 3500 : 7700;
    const perWeek = (opts.dailyCaloriesAbs * 7) / caloriesPerUnit;
    const decimals = opts.weightUnit === 'LB' ? 1 : 2;
    const unitLabel = opts.weightUnit === 'LB' ? 'lb' : 'kg';
    const formatted = formatNumber(perWeek, decimals);

    if (opts.goalMode === 'gain') {
        return `About +${formatted} ${unitLabel}/week`;
    }

    return `About ${formatted} ${unitLabel}/week`;
}

/**
 * Infer the user's goal mode from their current and target weights.
 *
 * We round to the nearest 0.1 unit to match backend storage behavior, which avoids cases where
 * small decimal differences (e.g. 170.04 vs 170.03) would flip the direction after rounding.
 *
 * Returns null when either value is missing/invalid.
 */
export function inferGoalModeFromWeights(startWeight: number | null, targetWeight: number | null): GoalMode | null {
    if (startWeight === null || targetWeight === null) return null;
    if (!Number.isFinite(startWeight) || !Number.isFinite(targetWeight)) return null;
    if (startWeight <= 0 || targetWeight <= 0) return null;

    const roundedStart = Math.round(startWeight * 10) / 10;
    const roundedTarget = Math.round(targetWeight * 10) / 10;

    if (roundedTarget === roundedStart) return 'maintain';
    if (roundedTarget < roundedStart) return 'lose';
    return 'gain';
}
