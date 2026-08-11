/**
 * Provides Expo client behavior for my food form validation.
 */
export const SAVED_FOOD_NAME_REQUIRED_ERROR = 'Enter a name for this saved food.';
export const RECIPE_NAME_REQUIRED_ERROR = 'Enter a recipe name.';

/** Only associate name-required failures with the name field; composite failures stay form-level. */
export function getSavedFoodNameError(error: string | null): string | undefined {
    return error === SAVED_FOOD_NAME_REQUIRED_ERROR ? error : undefined;
}

/** Resolve the recipe name error from the current validated state. */
export function getRecipeNameError(error: string | null): string | undefined {
    return error === RECIPE_NAME_REQUIRED_ERROR ? error : undefined;
}
