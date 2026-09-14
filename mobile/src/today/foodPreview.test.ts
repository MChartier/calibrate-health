import type { FoodLogEntry } from '@calibrate/api-client';
import { fitTodayFoodMeals, getTodayFoodMeals, type FoodPreviewMeasurements } from './foodPreview';

const ENTRIES: FoodLogEntry[] = [
    { id: 1, meal_period: 'DINNER', name: 'Salmon', calories: 300 },
    { id: 2, meal_period: 'BREAKFAST', name: 'Oatmeal', calories: 200 },
    { id: 3, meal_period: 'DINNER', name: 'Potatoes', calories: 210 },
    { id: 4, meal_period: 'LUNCH', name: 'Wrap', calories: 520 },
    { id: 5, meal_period: 'BREAKFAST', name: 'Berries', calories: 75 },
    { id: 6, meal_period: 'DINNER', name: 'Green beans with a long preparation description', calories: 110 }
];

const MEASUREMENTS: FoodPreviewMeasurements = {
    meals: { BREAKFAST: 24, LUNCH: 24, DINNER: 24 },
    entries: { 1: 28, 2: 28, 3: 28, 4: 28, 5: 28, 6: 52 },
    omission: 28,
    mealGap: 16
};

describe('Today food preview', () => {
    it('orders meal periods chronologically while preserving log order within meals', () => {
        const meals = getTodayFoodMeals(ENTRIES);
        expect(meals.map(({ meal }) => meal)).toEqual(['BREAKFAST', 'LUNCH', 'DINNER']);
        expect(meals.flatMap(({ entries }) => entries.map(({ id }) => id))).toEqual([2, 5, 4, 1, 3, 6]);
        expect(ENTRIES.map(({ id }) => id)).toEqual([1, 2, 3, 4, 5, 6]);
    });

    it('shows every complete row when there is room and does not reserve an omission line', () => {
        const result = fitTodayFoodMeals(getTodayFoodMeals(ENTRIES), 296, MEASUREMENTS);
        expect(result.omittedCount).toBe(0);
        expect(result.meals.flatMap(({ entries }) => entries)).toHaveLength(6);
    });

    it('keeps the latest fitting suffix, its actual wrapped row height, and the full meal total', () => {
        const result = fitTodayFoodMeals(getTodayFoodMeals(ENTRIES), 132, MEASUREMENTS);
        expect(result.omittedCount).toBe(4);
        expect(result.meals).toEqual([{
            meal: 'DINNER', calories: 620, entries: [ENTRIES[2], ENTRIES[5]]
        }]);
        // 28px omission + 24px meal heading + 28px short row + 52px wrapped row = 132px.
        const tighter = fitTodayFoodMeals(getTodayFoodMeals(ENTRIES), 131, MEASUREMENTS);
        expect(tighter.omittedCount).toBe(5);
        expect(tighter.meals[0].entries.map(({ id }) => id)).toEqual([6]);
    });

    it('removes empty meal headings and their inter-meal gaps while fitting', () => {
        const result = fitTodayFoodMeals(getTodayFoodMeals(ENTRIES), 228, MEASUREMENTS);
        expect(result.meals.map(({ meal }) => meal)).toEqual(['LUNCH', 'DINNER']);
        expect(result.omittedCount).toBe(2);
    });

    it('never substitutes older short rows when the newest row cannot fit whole', () => {
        const result = fitTodayFoodMeals(getTodayFoodMeals(ENTRIES), 90, MEASUREMENTS);
        expect(result).toEqual({ meals: [], omittedCount: ENTRIES.length });
    });

    it('handles an empty day and does not mutate full entries during repeated fitting', () => {
        expect(fitTodayFoodMeals([], 100, MEASUREMENTS)).toEqual({ meals: [], omittedCount: 0 });
        const meals = getTodayFoodMeals(ENTRIES);
        fitTodayFoodMeals(meals, 80, MEASUREMENTS);
        expect(meals.flatMap(({ entries }) => entries)).toHaveLength(6);
    });
});
