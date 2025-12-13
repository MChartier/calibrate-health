import { FoodDataProvider, FoodMeasure, FoodSearchRequest, FoodSearchResult, NormalizedFoodItem, Nutrients } from './types';
import { parseNumber, round, scaleNutrients } from './utils';

type OpenFoodFactsProduct = {
    code?: string;
    product_name?: string;
    brands?: string;
    nutriments?: Record<string, unknown>;
    serving_size?: string;
    serving_quantity?: number | string;
    product_quantity?: number;
    quantity?: string;
};

class OpenFoodFactsProvider implements FoodDataProvider {
    public name = 'openFoodFacts' as const;
    public supportsBarcodeLookup = true;
    private baseUrl = 'https://world.openfoodfacts.org';

    async searchFoods(request: FoodSearchRequest): Promise<FoodSearchResult> {
        if (request.barcode) {
            const product = await this.fetchProductByBarcode(request.barcode);
            if (product) {
                const item = this.normalizeProduct(product, request.quantityInGrams);
                return { items: item ? [item] : [] };
            }
        }

        const query = request.query || request.barcode;
        if (!query) {
            return { items: [] };
        }

        const pageSize = Math.min(request.pageSize ?? 10, 50);
        const page = request.page ?? 1;
        const url = `${this.baseUrl}/cgi/search.pl?search_terms=${encodeURIComponent(query)}&search_simple=1&json=1&action=process&page_size=${pageSize}&page=${page}&sort_by=unique_scans_n&fields=product_name,brands,code,nutriments,serving_size,serving_quantity,product_quantity,quantity,lc`;
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'cal-io/food-search'
            }
        });

        if (!response.ok) {
            const message = await response.text();
            throw new Error(`Open Food Facts search failed: ${response.status} ${message}`);
        }

        const data = await response.json();
        const items: NormalizedFoodItem[] = Array.isArray(data.products)
            ? data.products
                  .map((product: OpenFoodFactsProduct) => this.normalizeProduct(product, request.quantityInGrams))
                  .filter((item: NormalizedFoodItem | null): item is NormalizedFoodItem => Boolean(item))
                  .filter((item: NormalizedFoodItem) => item.description.toLowerCase().includes(query.toLowerCase()))
            : [];

        return { items };
    }

    private async fetchProductByBarcode(barcode: string): Promise<OpenFoodFactsProduct | null> {
        const response = await fetch(`${this.baseUrl}/api/v2/product/${encodeURIComponent(barcode)}?fields=product_name,brands,code,nutriments,serving_size,serving_quantity,product_quantity,quantity`);
        if (!response.ok) {
            return null;
        }

        const data = await response.json();
        if (data.status === 1 && data.product) {
            return data.product as OpenFoodFactsProduct;
        }

        return null;
    }

    private normalizeProduct(product: OpenFoodFactsProduct, quantityInGrams?: number): NormalizedFoodItem | null {
        const nutriments = product.nutriments || {};
        const nutrientsPer100g = this.extractNutrientsPer100g(nutriments);
        if (!nutrientsPer100g) {
            return null;
        }

        const measures = this.buildMeasures(product);
        const nutrientsForRequest =
            quantityInGrams && quantityInGrams > 0
                ? {
                      grams: quantityInGrams,
                      nutrients: scaleNutrients(nutrientsPer100g, quantityInGrams / 100)
                  }
                : undefined;

        return {
            id: product.code || product.product_name || 'openfoodfacts-item',
            source: 'openFoodFacts',
            description: product.product_name || 'Unknown food',
            brand: product.brands,
            barcode: product.code,
            availableMeasures: measures,
            nutrientsPer100g,
            nutrientsForRequest
        };
    }

    private extractNutrientsPer100g(nutriments: Record<string, unknown>): Nutrients | null {
        const calories =
            parseNumber(nutriments['energy-kcal_100g']) ??
            (nutriments['energy_100g'] ? round((parseNumber(nutriments['energy_100g']) || 0) / 4.184, 1) : undefined);

        if (calories === undefined) {
            return null;
        }

        const protein = parseNumber(nutriments['proteins_100g']);
        const fat = parseNumber(nutriments['fat_100g']);
        const carbs = parseNumber(nutriments['carbohydrates_100g']);

        return {
            calories,
            protein: protein !== undefined ? round(protein, 2) : undefined,
            fat: fat !== undefined ? round(fat, 2) : undefined,
            carbs: carbs !== undefined ? round(carbs, 2) : undefined
        };
    }

    private buildMeasures(product: OpenFoodFactsProduct): FoodMeasure[] {
        const measures: FoodMeasure[] = [{ label: 'per 100g', gramWeight: 100 }];
        const servingGramWeight = this.getServingGramWeight(product);

        if (servingGramWeight) {
            measures.push({
                label: product.serving_size ? `per serving (${product.serving_size})` : 'per serving',
                gramWeight: servingGramWeight
            });
        }

        const productQuantity = parseNumber(product.product_quantity);
        if (productQuantity) {
            measures.push({
                label: product.quantity ? product.quantity : 'package',
                gramWeight: productQuantity
            });
        }

        return measures;
    }

    private getServingGramWeight(product: OpenFoodFactsProduct): number | undefined {
        const servingQuantity = parseNumber(product.serving_quantity);
        if (servingQuantity) {
            return servingQuantity;
        }

        if (!product.serving_size) {
            return undefined;
        }

        const match = product.serving_size.match(/([\d.,]+)\s*(g|ml|oz)/i);
        if (!match) {
            return undefined;
        }

        const amount = parseNumber(match[1]);
        const unit = match[2].toLowerCase();

        if (!amount) {
            return undefined;
        }

        if (unit === 'g' || unit === 'ml') {
            return amount;
        }

        if (unit === 'oz') {
            return round(amount * 28.3495, 2);
        }

        return undefined;
    }
}

export default OpenFoodFactsProvider;
