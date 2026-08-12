import { MAX_WEIGHT_GRAMS, MIN_WEIGHT_GRAMS, type WeightUnit } from '@calibrate/shared';

const MAX_WEIGHT_DECIMAL_PLACES = 1;

/** Accept both mobile decimal separators while keeping the API's tenth-unit precision visible. */
export function normalizeWeightInputText(rawValue: string): string {
    const normalizedSeparator = rawValue.replace(/,/g, '.');
    const digitsAndSeparators = normalizedSeparator.replace(/[^\d.]/g, '');
    const [whole = '', ...fractionParts] = digitsAndSeparators.split('.');
    if (fractionParts.length === 0) return whole;
    const fraction = fractionParts.join('').slice(0, MAX_WEIGHT_DECIMAL_PLACES);
    return `${whole}.${fraction}`;
}

export function parseWeightInput(value: string): number | null {
    if (!value.trim() || value === '.') return null;
    const parsed = Number(value.replace(',', '.'));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function formatWeightInput(value: number): string {
    return value.toFixed(MAX_WEIGHT_DECIMAL_PLACES).replace(/\.0$/, '');
}

export function weightInputToCanonicalGrams(value: number, unit: WeightUnit | undefined): number {
    const grams = unit === 'LB' ? value * 453.59237 : value * 1_000;
    return Math.round(grams);
}

export function isWeightWithinPolicy(value: number, unit: WeightUnit | undefined): boolean {
    if (!Number.isFinite(value)) return false;
    const grams = weightInputToCanonicalGrams(value, unit);
    return grams >= MIN_WEIGHT_GRAMS && grams <= MAX_WEIGHT_GRAMS;
}

export function getWeightDisplayBounds(unit: WeightUnit | undefined): { minimum: number; maximum: number } {
    return unit === 'LB'
        ? { minimum: 55.2, maximum: 881.8 }
        : { minimum: 25, maximum: 400 };
}

export function getWeightPolicyError(unit: WeightUnit | undefined): string {
    const bounds = getWeightDisplayBounds(unit);
    const unitLabel = unit === 'LB' ? 'lb' : 'kg';
    return `Enter a weight from ${bounds.minimum} to ${bounds.maximum} ${unitLabel}.`;
}

export function getSpokenWeightUnit(unit: WeightUnit | undefined, plural = true): string {
    if (unit === 'LB') return plural ? 'pounds' : 'pound';
    return plural ? 'kilograms' : 'kilogram';
}

export function isWeightOutlier(args: {
    value: number;
    previousValue: number | null;
    unit: WeightUnit | undefined;
}): boolean {
    const { value, previousValue, unit } = args;
    if (previousValue === null || previousValue <= 0) return false;
    const absoluteChange = Math.abs(value - previousValue);
    const unitThreshold = unit === 'LB' ? 10 : 5;
    return absoluteChange >= unitThreshold || absoluteChange / previousValue >= 0.1;
}
