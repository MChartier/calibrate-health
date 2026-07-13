import { MEAL_PERIODS } from '@calibrate/shared';
import {
    buildSearchedFoodLogPayload,
    calculateFoodServing,
    getPreferredFoodMeasureIndex,
    normalizeSearchedFoodItem
} from './serving';

const providerItem = {
    id: 'provider-food-1',
    source: 'fatsecret',
    description: 'Greek yogurt',
    brand: 'Example Dairy',
    barcode: '12345',
    locale: 'en-US',
    availableMeasures: [
        { label: 'per 100g', gramWeight: 100, quantity: 100, unit: 'g' },
        { label: '1 container', gramWeight: 170, quantity: 1, unit: 'container' }
    ],
    nutrientsPer100g: { calories: 59, protein: 10 }
};

describe('searched food serving calculations', () => {
    it('normalizes provider measures and prefers a practical one-serving default', () => {
        const item = normalizeSearchedFoodItem(providerItem);

        expect(item).not.toBeNull();
        expect(item?.name).toBe('Greek yogurt');
        expect(item?.measures).toHaveLength(2);
        expect(getPreferredFoodMeasureIndex(item!)).toBe(1);
    });

    it('recomputes calories and grams deterministically for fractional quantities', () => {
        const item = normalizeSearchedFoodItem(providerItem)!;
        const calculation = calculateFoodServing(item, item.measures[1], 1.5);

        expect(calculation).toEqual({
            quantity: 1.5,
            calories: 150,
            caloriesPerMeasure: 100.3,
            gramsPerMeasure: 170,
            gramsTotal: 255
        });
    });

    it('preserves the complete immutable serving and provider snapshot', () => {
        const item = normalizeSearchedFoodItem(providerItem)!;
        const result = buildSearchedFoodLogPayload({
            item,
            measure: item.measures[1],
            quantity: 1.5,
            date: '2026-07-12',
            meal: MEAL_PERIODS.BREAKFAST
        });

        expect(result).toEqual({
            ok: true,
            calculation: expect.objectContaining({ calories: 150, gramsTotal: 255 }),
            payload: {
                date: '2026-07-12',
                meal_period: MEAL_PERIODS.BREAKFAST,
                name: 'Greek yogurt',
                calories: 150,
                servings_consumed: 1.5,
                serving_size_quantity_snapshot: 1,
                serving_unit_label_snapshot: 'container',
                calories_per_serving_snapshot: 100.3,
                external_source: 'fatsecret',
                external_id: 'provider-food-1',
                brand: 'Example Dairy',
                locale: 'en-US',
                barcode: '12345',
                measure_label: '1 container',
                grams_per_measure_snapshot: 170,
                measure_quantity_snapshot: 1.5,
                grams_total_snapshot: 255
            }
        });
    });

    it('rejects missing measures, nutrients, and invalid quantities without inventing snapshots', () => {
        const noData = normalizeSearchedFoodItem({ id: 'x', description: 'Unknown', availableMeasures: [] })!;
        expect(buildSearchedFoodLogPayload({
            item: noData,
            measure: null,
            quantity: 1,
            date: '2026-07-12',
            meal: MEAL_PERIODS.LUNCH
        })).toEqual({ ok: false, message: 'This food does not include a usable serving measure.' });

        const item = normalizeSearchedFoodItem(providerItem)!;
        expect(buildSearchedFoodLogPayload({
            item,
            measure: item.measures[0],
            quantity: 0,
            date: '2026-07-12',
            meal: MEAL_PERIODS.LUNCH
        })).toEqual({ ok: false, message: 'Quantity must be a positive number.' });
    });
});
