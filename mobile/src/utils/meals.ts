import { MEAL_PERIODS, type MealPeriod } from '@calibrate/shared';

/**
 * Stable display order for every native meal selector and meal summary.
 */
export const MEAL_OPTIONS: MealPeriod[] = [
    MEAL_PERIODS.BREAKFAST,
    MEAL_PERIODS.MORNING_SNACK,
    MEAL_PERIODS.LUNCH,
    MEAL_PERIODS.AFTERNOON_SNACK,
    MEAL_PERIODS.DINNER,
    MEAL_PERIODS.EVENING_SNACK
];
