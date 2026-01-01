import type { Translate } from '../i18n/i18nContext';
import type { TranslationKey } from '../i18n/resources';

/**
 * Canonical meal periods supported by the backend `MealPeriod` enum.
 *
 * These values are stable API identifiers (not display labels). Use
 * `getMealPeriodLabel` when rendering user-facing text.
 */
export type MealPeriod =
    | 'BREAKFAST'
    | 'MORNING_SNACK'
    | 'LUNCH'
    | 'AFTERNOON_SNACK'
    | 'DINNER'
    | 'EVENING_SNACK';

/**
 * Fixed UI ordering for meal periods.
 */
export const MEAL_PERIOD_ORDER: MealPeriod[] = [
    'BREAKFAST',
    'MORNING_SNACK',
    'LUNCH',
    'AFTERNOON_SNACK',
    'DINNER',
    'EVENING_SNACK'
];

export const MEAL_PERIOD_LABEL_KEYS: Record<MealPeriod, TranslationKey> = {
    BREAKFAST: 'mealPeriod.BREAKFAST',
    MORNING_SNACK: 'mealPeriod.MORNING_SNACK',
    LUNCH: 'mealPeriod.LUNCH',
    AFTERNOON_SNACK: 'mealPeriod.AFTERNOON_SNACK',
    DINNER: 'mealPeriod.DINNER',
    EVENING_SNACK: 'mealPeriod.EVENING_SNACK'
};

/**
 * Return a localized display label for a meal period.
 */
export function getMealPeriodLabel(mealPeriod: MealPeriod, t: Translate): string {
    return t(MEAL_PERIOD_LABEL_KEYS[mealPeriod]);
}
