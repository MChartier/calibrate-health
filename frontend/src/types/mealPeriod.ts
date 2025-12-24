/**
 * Canonical meal periods supported by the backend `MealPeriod` enum.
 *
 * These values are stable API identifiers (not display labels). Use
 * `MEAL_PERIOD_LABELS` when rendering user-facing text.
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

/**
 * Display labels for each meal period.
 */
export const MEAL_PERIOD_LABELS: Record<MealPeriod, string> = {
    BREAKFAST: 'Breakfast',
    MORNING_SNACK: 'Morning Snack',
    LUNCH: 'Lunch',
    AFTERNOON_SNACK: 'Afternoon Snack',
    DINNER: 'Dinner',
    EVENING_SNACK: 'Evening Snack'
};

