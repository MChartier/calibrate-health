export type MyFoodType = 'FOOD' | 'RECIPE';

export type MyFood = {
    id: number;
    user_id: number;
    type: MyFoodType;
    name: string;
    serving_size_quantity: number;
    serving_unit_label: string;
    calories_per_serving: number;
    recipe_total_calories?: number | null;
    yield_servings?: number | null;
    created_at?: string;
    updated_at?: string;
};

export type RecipeIngredientSource = 'MY_FOOD' | 'EXTERNAL';

export type RecipeIngredient = {
    id: number;
    recipe_id: number;
    sort_order: number;
    source: RecipeIngredientSource;
    name_snapshot: string;
    calories_total_snapshot: number;
};

export type MyFoodWithIngredients = MyFood & {
    recipe_ingredients?: RecipeIngredient[];
};

