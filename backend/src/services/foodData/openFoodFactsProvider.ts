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
    lc?: string;
};

class OpenFoodFactsProvider implements FoodDataProvider {
    public name = 'openFoodFacts' as const;
    public supportsBarcodeLookup = true;
    private baseUrl = 'https://world.openfoodfacts.org';
    private searchFields = 'product_name,brands,code,nutriments,serving_size,serving_quantity,product_quantity,quantity,lc';

    async searchFoods(request: FoodSearchRequest): Promise<FoodSearchResult> {
        if (request.barcode) {
            const product = await this.fetchProductByBarcode(request.barcode, request.languageCode);
            if (product) {
                const item = this.normalizeProduct(product, request.quantityInGrams, request.includeIncomplete);
                return { items: item ? [item] : [] };
            }
        }

        const query = request.query || request.barcode;
        if (!query) {
            return { items: [] };
        }

        const pageSize = Math.min(request.pageSize ?? 10, 50);
        const page = request.page ?? 1;
        const response = await this.fetchSearchResponse(query, pageSize, page, request.languageCode);

        if (!response.ok) {
            const message = await response.text();
            throw new Error(`Open Food Facts search failed: ${response.status} ${message}`);
        }

        const data = await response.json();
        const items: NormalizedFoodItem[] = Array.isArray(data.products)
            ? data.products
                  .map((product: OpenFoodFactsProduct) => this.normalizeProduct(product, request.quantityInGrams, request.includeIncomplete))
                  .filter((item: NormalizedFoodItem | null): item is NormalizedFoodItem => Boolean(item))
            : [];

        return { items: this.rankItems(items, query, request.languageCode) };
    }

    /**
     * Use the v2 search endpoint first, with a legacy fallback for upstream instability.
     */
    private async fetchSearchResponse(
        query: string,
        pageSize: number,
        page: number,
        languageCode?: string
    ): Promise<Response> {
        const headers = { 'User-Agent': 'cal-io/food-search' };
        const v2Params = new URLSearchParams({
            search_terms: query,
            page_size: String(pageSize),
            page: String(page),
            fields: this.searchFields
        });
        if (languageCode) {
            v2Params.set('lc', languageCode);
        }
        const v2Url = `${this.baseUrl}/api/v2/search?${v2Params.toString()}`;
        const v2Response = await fetch(v2Url, { headers });
        if (v2Response.ok || (v2Response.status < 500 && v2Response.status !== 404)) {
            return v2Response;
        }

        const legacyParams = new URLSearchParams({
            search_terms: query,
            search_simple: '1',
            json: '1',
            action: 'process',
            page_size: String(pageSize),
            page: String(page),
            fields: this.searchFields
        });
        if (languageCode) {
            legacyParams.set('lc', languageCode);
        }
        const legacyUrl = `${this.baseUrl}/cgi/search.pl?${legacyParams.toString()}`;
        return fetch(legacyUrl, { headers });
    }

    private async fetchProductByBarcode(barcode: string, languageCode?: string): Promise<OpenFoodFactsProduct | null> {
        const params = new URLSearchParams({
            fields: 'product_name,brands,code,nutriments,serving_size,serving_quantity,product_quantity,quantity,lc'
        });
        if (languageCode) {
            params.set('lc', languageCode);
        }
        const response = await fetch(`${this.baseUrl}/api/v2/product/${encodeURIComponent(barcode)}?${params.toString()}`);
        if (!response.ok) {
            return null;
        }

        const data = await response.json();
        if (data.status === 1 && data.product) {
            return data.product as OpenFoodFactsProduct;
        }

        return null;
    }

    private normalizeProduct(
        product: OpenFoodFactsProduct,
        quantityInGrams?: number,
        includeIncomplete?: boolean
    ): NormalizedFoodItem | null {
        const nutriments = product.nutriments || {};
        const nutrientsPer100g = this.extractNutrientsPer100g(nutriments);
        if (!nutrientsPer100g && !includeIncomplete) {
            return null;
        }

        const measures = this.buildMeasures(product);
        const nutrientsForRequest =
            nutrientsPer100g && quantityInGrams && quantityInGrams > 0
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
            locale: product.lc,
            availableMeasures: measures,
            nutrientsPer100g: nutrientsPer100g ?? undefined,
            nutrientsForRequest
        };
    }

    /**
     * Apply lightweight relevance scoring so product name matches bubble up.
     */
    private rankItems(items: NormalizedFoodItem[], query: string, languageCode?: string): NormalizedFoodItem[] {
        const normalizedQuery = this.normalizeText(query);
        if (!normalizedQuery) {
            return items;
        }
        const tokens = normalizedQuery.split(' ').filter(Boolean);
        if (tokens.length === 0) {
            return items;
        }

        const scored = items.map((item, index) => {
            const description = this.normalizeText(item.description);
            const brand = this.normalizeText(item.brand);
            let score = this.scoreMatch(description, brand, normalizedQuery, tokens, item.locale, languageCode);
            if (item.nutrientsPer100g?.calories !== undefined) {
                score += 5;
            }
            return { item, score, index };
        });

        const hasScore = scored.some(({ score }) => score > 0);
        if (!hasScore) {
            return items;
        }

        scored.sort((a, b) => b.score - a.score || a.index - b.index);
        return scored.map(({ item }) => item);
    }

    /**
     * Normalize text into comparable tokens for ranking and filtering.
     */
    private normalizeText(value?: string): string {
        if (!value) {
            return '';
        }
        return value
            .toLowerCase()
            .normalize('NFKD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^a-z0-9]+/g, ' ')
            .trim();
    }

    /**
     * Score relevance based on name/brand similarity and optional locale match.
     */
    private scoreMatch(
        description: string,
        brand: string,
        query: string,
        tokens: string[],
        locale?: string,
        languageCode?: string
    ): number {
        let score = 0;

        if (description === query) {
            score += 120;
        } else if (description.startsWith(query)) {
            score += 100;
        } else if (description.includes(query)) {
            score += 80;
        }

        if (brand && brand.includes(query)) {
            score += 35;
        }

        const tokenMatches = tokens.filter((token) => description.includes(token)).length;
        if (tokenMatches === tokens.length) {
            score += 45;
        } else if (tokenMatches > 0) {
            score += 15;
        }

        if (languageCode && locale && locale === languageCode) {
            score += 10;
        }

        return score;
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
