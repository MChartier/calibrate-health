export type FoodDataSource = 'usda' | 'openFoodFacts';

export type Nutrients = {
    calories: number;
    protein?: number;
    fat?: number;
    carbs?: number;
};

export type FoodMeasure = {
    label: string;
    gramWeight?: number;
    quantity?: number;
    unit?: string;
};

export type NutrientsForQuantity = {
    grams: number;
    nutrients: Nutrients;
    note?: string;
};

export type NormalizedFoodItem = {
    id: string;
    source: FoodDataSource;
    description: string;
    brand?: string;
    barcode?: string;
    locale?: string;
    availableMeasures: FoodMeasure[];
    nutrientsPer100g?: Nutrients;
    nutrientsForRequest?: NutrientsForQuantity;
};

