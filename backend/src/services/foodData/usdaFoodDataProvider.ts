import { FoodDataProvider, FoodMeasure, FoodSearchRequest, FoodSearchResult, NormalizedFoodItem, Nutrients } from './types';
import { parseNumber, round, scaleNutrients } from './utils';

type FoodNutrient = {
    nutrientId?: number;
    nutrientName?: string;
    nutrientNumber?: string;
    unitName?: string;
    amount?: number;
};

type FoodPortion = {
    modifier?: string;
    measureUnit?: { name?: string };
    portionDescription?: string;
    gramWeight?: number;
};

type LabelNutrients = {
    calories?: { value?: number };
    protein?: { value?: number };
    fat?: { value?: number };
    carbohydrates?: { value?: number };
};

type UsdaFood = {
    fdcId: number;
    description?: string;
    brandOwner?: string;
    brandName?: string;
    gtinUpc?: string;
    dataType?: string;
    householdServingFullText?: string;
    servingSize?: number;
    servingSizeUnit?: string;
    labelNutrients?: LabelNutrients;
    foodNutrients?: FoodNutrient[];
    foodPortions?: FoodPortion[];
};

class UsdaFoodDataProvider implements FoodDataProvider {
    public name = 'usda' as const;
    public supportsBarcodeLookup = true;
    private apiKey: string;
    private baseUrl = 'https://api.nal.usda.gov/fdc/v1';

    constructor(apiKey: string) {
        this.apiKey = apiKey;
    }

    async searchFoods(request: FoodSearchRequest): Promise<FoodSearchResult> {
        const query = request.barcode || request.query;
        if (!query) {
            return { items: [] };
        }

        const pageSize = Math.min(request.pageSize ?? 10, 50);
        const pageNumber = request.page ?? 1;

        const response = await fetch(`${this.baseUrl}/foods/search?api_key=${this.apiKey}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                query,
                pageSize,
                pageNumber,
                sortBy: 'dataType.keyword',
                sortOrder: 'asc',
                dataType: ['Branded', 'Foundation', 'SR Legacy', 'Survey (FNDDS)']
            })
        });

        if (!response.ok) {
            const message = await response.text();
            throw new Error(`USDA search failed: ${response.status} ${message}`);
        }

        const data = await response.json();
        const items: NormalizedFoodItem[] = Array.isArray(data.foods)
            ? data.foods
                  .map((food: UsdaFood) => this.normalizeFood(food, request.quantityInGrams))
                  .filter((item: NormalizedFoodItem | null): item is NormalizedFoodItem => Boolean(item))
            : [];

        return { items };
    }

    private normalizeFood(food: UsdaFood, quantityInGrams?: number): NormalizedFoodItem | null {
        const measures = this.buildMeasures(food);
        const nutrientsPer100g = this.getNutrientsPer100g(food, measures);
        if (!nutrientsPer100g) {
            return null;
        }

        const nutrientsForRequest = quantityInGrams
            ? {
                  grams: quantityInGrams,
                  nutrients: scaleNutrients(nutrientsPer100g, quantityInGrams / 100)
              }
            : undefined;

        return {
            id: String(food.fdcId),
            source: 'usda',
            description: food.description || 'Unknown food',
            brand: food.brandOwner || food.brandName || undefined,
            barcode: food.gtinUpc || undefined,
            availableMeasures: measures,
            nutrientsPer100g,
            nutrientsForRequest
        };
    }

    private buildMeasures(food: UsdaFood): FoodMeasure[] {
        const measures: FoodMeasure[] = [];
        const servingSize = parseNumber(food.servingSize);
        const servingUnit = (food.servingSizeUnit || '').toLowerCase();

        if (servingSize) {
            measures.push({
                label: food.householdServingFullText || 'serving',
                gramWeight: this.toGrams(servingSize, servingUnit),
                quantity: servingSize,
                unit: servingUnit || undefined
            });
        }

        if (Array.isArray(food.foodPortions)) {
            food.foodPortions.slice(0, 8).forEach((portion) => {
                if (portion.gramWeight) {
                    measures.push({
                        label: portion.modifier || portion.portionDescription || portion.measureUnit?.name || 'portion',
                        gramWeight: portion.gramWeight
                    });
                }
            });
        }

        measures.push({ label: 'per 100g', gramWeight: 100 });
        return measures;
    }

    private getNutrientsPer100g(food: UsdaFood, measures: FoodMeasure[]): Nutrients | undefined {
        const fromFoodNutrients = this.extractFromFoodNutrients(food.foodNutrients);
        if (fromFoodNutrients?.calories !== undefined) {
            return fromFoodNutrients;
        }

        const servingGramWeight = this.getServingGramWeight(food, measures);
        if (food.labelNutrients && servingGramWeight) {
            const factor = 100 / servingGramWeight;
            return {
                calories: round((food.labelNutrients.calories?.value || 0) * factor, 1),
                protein: food.labelNutrients.protein?.value !== undefined ? round(food.labelNutrients.protein.value * factor, 2) : undefined,
                fat: food.labelNutrients.fat?.value !== undefined ? round(food.labelNutrients.fat.value * factor, 2) : undefined,
                carbs: food.labelNutrients.carbohydrates?.value !== undefined ? round(food.labelNutrients.carbohydrates.value * factor, 2) : undefined
            };
        }

        return undefined;
    }

    private extractFromFoodNutrients(foodNutrients?: FoodNutrient[]): Nutrients | undefined {
        if (!Array.isArray(foodNutrients)) {
            return undefined;
        }

        const findNutrient = (codes: string[], names: string[]): number | undefined => {
            const nutrient = foodNutrients.find((n) => {
                const nutrientNumber = n.nutrientNumber || String(n.nutrientId || '');
                const name = (n.nutrientName || '').toLowerCase();
                return (nutrientNumber && codes.includes(nutrientNumber)) || names.some((title) => name.includes(title));
            });

            if (!nutrient?.amount) {
                return undefined;
            }

            const unit = (nutrient.unitName || '').toLowerCase();
            if (codes.includes('1008') && unit === 'kj') {
                // Convert kilojoules to kcal if needed.
                return round(nutrient.amount / 4.184, 1);
            }

            return nutrient.amount;
        };

        const calories = findNutrient(['1008'], ['energy']);
        const protein = findNutrient(['1003'], ['protein']);
        const fat = findNutrient(['1004'], ['fat']);
        const carbs = findNutrient(['1005'], ['carbohydrate', 'carbohydrates']);

        if (calories === undefined && protein === undefined && fat === undefined && carbs === undefined) {
            return undefined;
        }

        return {
            calories: calories ?? 0,
            protein,
            fat,
            carbs
        };
    }

    private getServingGramWeight(food: UsdaFood, measures: FoodMeasure[]): number | undefined {
        const directServing = measures.find((m) => m.label === (food.householdServingFullText || 'serving') && m.gramWeight);
        if (directServing?.gramWeight) {
            return directServing.gramWeight;
        }

        const servingSize = parseNumber(food.servingSize);
        const servingUnit = (food.servingSizeUnit || '').toLowerCase();
        if (servingSize) {
            return this.toGrams(servingSize, servingUnit);
        }

        return undefined;
    }

    private toGrams(amount: number, unit: string): number | undefined {
        if (!amount || !unit) {
            return undefined;
        }

        if (unit === 'g' || unit === 'gram' || unit === 'grams') {
            return amount;
        }
        if (unit === 'oz' || unit === 'ounce' || unit === 'ounces') {
            return round(amount * 28.3495, 2);
        }
        if (unit === 'kg' || unit === 'kilogram' || unit === 'kilograms') {
            return amount * 1000;
        }

        return undefined;
    }
}

export default UsdaFoodDataProvider;
