import type { MyFoodDetail, MyFoodSummary } from '@calibrate/api-client';
import { hydrateRecipeIngredientDrafts, serializeRecipeIngredientDrafts } from './myFoodEditing';

const savedFood = { id: 4, name: 'Oats', type: 'FOOD', is_pinned: false } as MyFoodSummary;

test('recipe editing restores live source foods and preserves orphan snapshots', () => {
    const detail = {
        recipe_ingredients: [
            { id: 1, source: 'MY_FOOD', source_my_food_id: 4, quantity_servings: 2 },
            {
                id: 2,
                source: 'MY_FOOD',
                source_my_food_id: null,
                quantity_servings: 1,
                name_snapshot: 'Deleted food',
                calories_total_snapshot: 90,
                external_source: null,
                external_id: null,
                brand_snapshot: null,
                locale_snapshot: null,
                barcode_snapshot: null,
                measure_label_snapshot: null,
                grams_per_measure_snapshot: null,
                measure_quantity_snapshot: null,
                grams_total_snapshot: null
            }
        ]
    } as unknown as MyFoodDetail;
    const drafts = hydrateRecipeIngredientDrafts(detail, [savedFood]);
    const serialized = serializeRecipeIngredientDrafts(drafts);
    expect(serialized[0]).toEqual(expect.objectContaining({ source: 'MY_FOOD', my_food_id: 4, quantity_servings: 2 }));
    expect(serialized[1]).toEqual(expect.objectContaining({ source: 'EXTERNAL', name: 'Deleted food', calories_total: 90 }));
});
