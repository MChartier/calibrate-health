import type { FoodLogEntry } from '@calibrate/api-client';
import { MEAL_PERIODS, type MealPeriod } from '@calibrate/shared';

export type TodayFoodMeal = {
    meal: MealPeriod;
    entries: FoodLogEntry[];
    calories: number;
};

export type FoodPreviewMeasurements = {
    entries: Readonly<Record<number, number>>;
    meals: Readonly<Partial<Record<MealPeriod, number>>>;
    omission: number;
    mealGap: number;
};

/** Meal periods define the day's chronology; the endpoint preserves log order within a meal. */
export function getTodayFoodMeals(entries: readonly FoodLogEntry[]): TodayFoodMeal[] {
    return Object.values(MEAL_PERIODS).flatMap((meal) => {
        const mealEntries = entries.filter((entry) => entry.meal_period === meal);
        if (!mealEntries.length) return [];
        return [{ meal, entries: mealEntries, calories: mealEntries.reduce((total, entry) => total + entry.calories, 0) }];
    });
}

/** Keep a chronological suffix of whole measured rows, including each visible meal's full total. */
export function fitTodayFoodMeals(
    meals: readonly TodayFoodMeal[],
    availableHeight: number,
    measurements: FoodPreviewMeasurements
): { meals: TodayFoodMeal[]; omittedCount: number } {
    const visible = meals.map((meal) => ({ ...meal, entries: [...meal.entries] }));
    let contentHeight = visible.reduce((height, meal) => (
        height + (measurements.meals[meal.meal] ?? 0)
        + meal.entries.reduce((sum, entry) => sum + (measurements.entries[entry.id] ?? 0), 0)
    ), Math.max(0, visible.length - 1) * measurements.mealGap);
    let omittedCount = 0;

    while (visible.length && contentHeight + (omittedCount ? measurements.omission : 0) > availableHeight) {
        const firstMeal = visible[0];
        const firstEntry = firstMeal.entries.shift()!;
        contentHeight -= measurements.entries[firstEntry.id] ?? 0;
        omittedCount += 1;
        if (!firstMeal.entries.length) {
            visible.shift();
            contentHeight -= measurements.meals[firstMeal.meal] ?? 0;
            if (visible.length) contentHeight -= measurements.mealGap;
        }
    }

    return { meals: visible, omittedCount };
}
