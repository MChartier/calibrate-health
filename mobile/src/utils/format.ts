import { MEAL_PERIODS, type MealPeriod, type WeightUnit } from '@calibrate/shared';

const MEAL_LABELS: Record<MealPeriod, string> = {
    [MEAL_PERIODS.BREAKFAST]: 'Breakfast',
    [MEAL_PERIODS.MORNING_SNACK]: 'AM snack',
    [MEAL_PERIODS.LUNCH]: 'Lunch',
    [MEAL_PERIODS.AFTERNOON_SNACK]: 'PM snack',
    [MEAL_PERIODS.DINNER]: 'Dinner',
    [MEAL_PERIODS.EVENING_SNACK]: 'Evening'
};

const MEAL_CHIP_LABELS: Record<MealPeriod, string> = {
    [MEAL_PERIODS.BREAKFAST]: 'Breakfast',
    [MEAL_PERIODS.MORNING_SNACK]: 'AM snack',
    [MEAL_PERIODS.LUNCH]: 'Lunch',
    [MEAL_PERIODS.AFTERNOON_SNACK]: 'PM snack',
    [MEAL_PERIODS.DINNER]: 'Dinner',
    [MEAL_PERIODS.EVENING_SNACK]: 'Evening'
};

export function formatMealPeriod(meal: MealPeriod): string {
    return MEAL_LABELS[meal] ?? meal;
}

export function formatMealChipLabel(meal: MealPeriod): string {
    return MEAL_CHIP_LABELS[meal] ?? formatMealPeriod(meal);
}

export function formatCalories(value: number | null | undefined): string {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return '-';
    }

    return `${Math.round(value).toLocaleString()} kcal`;
}

export function formatNumber(value: number | null | undefined, fractionDigits = 1): string {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return '-';
    }

    return value.toLocaleString(undefined, {
        maximumFractionDigits: fractionDigits
    });
}

export function formatWeight(value: number | null | undefined, unit: WeightUnit | undefined): string {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return '-';
    }

    return `${formatNumber(value)} ${formatWeightUnit(unit)}`;
}

export function formatWeightUnit(unit: WeightUnit | undefined): string {
    return unit === 'LB' ? 'lb' : 'kg';
}

export function formatSignedCalories(value: number | null | undefined): string {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
        return '-';
    }

    const rounded = Math.round(value);
    const sign = rounded > 0 ? '+' : '';
    return `${sign}${rounded.toLocaleString()} kcal`;
}
