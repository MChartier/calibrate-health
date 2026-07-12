import type { CreateRecipePayload, MyFoodDetail, MyFoodSummary } from '@calibrate/api-client';

export type RecipeIngredientDraft =
    | { key: string; source: 'MY_FOOD'; myFood: MyFoodSummary; servings: number }
    | {
          key: string;
          source: 'EXTERNAL';
          name: string;
          caloriesTotal: number;
          snapshot: Omit<Extract<CreateRecipePayload['ingredients'][number], { source: 'EXTERNAL' }>, 'source' | 'sort_order' | 'name' | 'calories_total'>;
      };

/** Restores editable live references and preserves orphan/external ingredient snapshots verbatim. */
export function hydrateRecipeIngredientDrafts(
    detail: MyFoodDetail,
    savedFoods: MyFoodSummary[]
): RecipeIngredientDraft[] {
    return (detail.recipe_ingredients ?? []).map((ingredient) => {
        const sourceFood = ingredient.source_my_food_id
            ? savedFoods.find(({ id }) => id === ingredient.source_my_food_id)
            : undefined;
        if (ingredient.source === 'MY_FOOD' && sourceFood && ingredient.quantity_servings) {
            return {
                key: `existing-${ingredient.id}`,
                source: 'MY_FOOD' as const,
                myFood: sourceFood,
                servings: ingredient.quantity_servings
            };
        }
        return {
            key: `existing-${ingredient.id}`,
            source: 'EXTERNAL' as const,
            name: ingredient.name_snapshot,
            caloriesTotal: ingredient.calories_total_snapshot,
            snapshot: {
                external_source: ingredient.external_source,
                external_id: ingredient.external_id,
                brand: ingredient.brand_snapshot,
                locale: ingredient.locale_snapshot,
                barcode: ingredient.barcode_snapshot,
                measure_label: ingredient.measure_label_snapshot,
                grams_per_measure: ingredient.grams_per_measure_snapshot,
                measure_quantity: ingredient.measure_quantity_snapshot,
                grams_total: ingredient.grams_total_snapshot
            }
        };
    });
}

export function serializeRecipeIngredientDrafts(
    drafts: RecipeIngredientDraft[]
): CreateRecipePayload['ingredients'] {
    return drafts.map((draft, index) => draft.source === 'MY_FOOD'
        ? {
              source: 'MY_FOOD',
              sort_order: index + 1,
              my_food_id: draft.myFood.id,
              quantity_servings: draft.servings
          }
        : {
              source: 'EXTERNAL',
              sort_order: index + 1,
              name: draft.name,
              calories_total: draft.caloriesTotal,
              ...draft.snapshot
          }
    );
}
