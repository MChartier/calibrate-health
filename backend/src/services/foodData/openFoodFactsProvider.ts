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
    private requestTimeoutMs: number;
    private searchMode: 'auto' | 'v2' | 'legacy';

    constructor() {
        const configured = process.env.OFF_TIMEOUT_MS;
        const parsed = configured ? parseInt(configured, 10) : Number.NaN;
        this.requestTimeoutMs = Number.isFinite(parsed) && parsed >= 0 ? parsed : 8000;

        const mode = (process.env.OFF_SEARCH_MODE || 'auto').toLowerCase();
        if (mode === 'auto' || mode === 'v2' || mode === 'legacy') {
            this.searchMode = mode;
        } else {
            this.searchMode = 'auto';
        }
    }

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

        if (this.searchMode === 'legacy') {
            const legacyResponse = await this.fetchSearchResponseLegacy(query, pageSize, page, request.languageCode);
            if (!legacyResponse.ok) {
                const legacyMessage = await this.describeSearchFailure('legacy', legacyResponse);
                throw new Error(`Open Food Facts search failed. ${legacyMessage}`);
            }
            const legacyItems = await this.parseItemsFromResponse(legacyResponse, request);
            const filtered = this.filterItemsByQuery(legacyItems, query);
            return { items: this.rankItems(filtered, query, request.languageCode) };
        }

        let v2Response: Response | null = null;
        let v2Error: unknown;
        try {
            v2Response = await this.fetchSearchResponseV2(query, pageSize, page, request.languageCode);
        } catch (error) {
            v2Error = error;
        }

        if (this.searchMode === 'v2') {
            if (!v2Response?.ok) {
                const v2Message = await this.describeSearchFailure('v2', v2Response, v2Error);
                throw new Error(`Open Food Facts search failed. ${v2Message}`);
            }
            const v2Items = await this.parseItemsFromResponse(v2Response, request);
            const filtered = this.filterItemsByQuery(v2Items, query);
            return { items: this.rankItems(filtered, query, request.languageCode) };
        }

        let items: NormalizedFoodItem[] = [];
        if (v2Response?.ok) {
            items = await this.parseItemsFromResponse(v2Response, request);
        }

        if (!v2Response?.ok || this.countQueryMatches(items, query) === 0) {
            const legacyResponse = await this.fetchSearchResponseLegacy(query, pageSize, page, request.languageCode);
            if (legacyResponse.ok) {
                items = await this.parseItemsFromResponse(legacyResponse, request);
            } else if (!v2Response?.ok) {
                const v2Message = await this.describeSearchFailure('v2', v2Response, v2Error);
                const legacyMessage = await this.describeSearchFailure('legacy', legacyResponse);
                throw new Error(`Open Food Facts search failed. ${v2Message}; ${legacyMessage}`);
            }
        }

        const filtered = this.filterItemsByQuery(items, query);
        return { items: this.rankItems(filtered, query, request.languageCode) };
    }

    /**
     * Convert API payloads into normalized items for reuse across search modes.
     */
    private async parseItemsFromResponse(
        response: Response,
        request: FoodSearchRequest
    ): Promise<NormalizedFoodItem[]> {
        const data = await response.json();
        return Array.isArray(data.products)
            ? data.products
                  .map((product: OpenFoodFactsProduct) =>
                      this.normalizeProduct(product, request.quantityInGrams, request.includeIncomplete)
                  )
                  .filter((item: NormalizedFoodItem | null): item is NormalizedFoodItem => Boolean(item))
            : [];
    }

    /**
     * Cap request time so the dashboard is not blocked by slow upstream calls.
     */
    private async fetchWithTimeout(url: string, headers: Record<string, string>): Promise<Response> {
        if (!this.requestTimeoutMs) {
            return fetch(url, { headers });
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.requestTimeoutMs);
        try {
            return await fetch(url, { headers, signal: controller.signal });
        } finally {
            clearTimeout(timeoutId);
        }
    }

    /**
     * Remove items that do not include any query tokens in name or brand.
     */
    private filterItemsByQuery(items: NormalizedFoodItem[], query: string): NormalizedFoodItem[] {
        const normalizedQuery = this.normalizeText(query);
        if (!normalizedQuery) {
            return items;
        }
        const tokens = normalizedQuery.split(' ').filter(Boolean);
        if (tokens.length === 0) {
            return items;
        }

        return items.filter((item) => {
            const description = this.normalizeText(item.description);
            const brand = this.normalizeText(item.brand);
            const haystack = `${description} ${brand}`.trim();
            return tokens.some((token) => haystack.includes(token));
        });
    }

    /**
     * Count how many items include at least one query token.
     */
    private countQueryMatches(items: NormalizedFoodItem[], query: string): number {
        const normalizedQuery = this.normalizeText(query);
        if (!normalizedQuery) {
            return 0;
        }
        const tokens = normalizedQuery.split(' ').filter(Boolean);
        if (tokens.length === 0) {
            return 0;
        }

        return items.reduce((count, item) => {
            const description = this.normalizeText(item.description);
            const brand = this.normalizeText(item.brand);
            const haystack = `${description} ${brand}`.trim();
            return tokens.some((token) => haystack.includes(token)) ? count + 1 : count;
        }, 0);
    }

    /**
     * Provide a consistent error summary for client responses and logs.
     */
    private async describeSearchFailure(
        label: string,
        response: Response | null,
        error?: unknown
    ): Promise<string> {
        if (response) {
            const message = await response.text();
            return `${label} ${response.status} ${message}`.trim();
        }
        if (error instanceof Error) {
            if (error.name === 'AbortError') {
                return `${label} request timed out after ${this.requestTimeoutMs}ms`;
            }
            return `${label} ${error.message}`;
        }
        return `${label} request failed`;
    }

    /**
     * Use the v2 search endpoint for faster responses.
     */
    private async fetchSearchResponseV2(
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
            fields: this.searchFields,
            sort_by: 'unique_scans_n'
        });
        if (languageCode) {
            v2Params.set('lc', languageCode);
        }
        const v2Url = `${this.baseUrl}/api/v2/search?${v2Params.toString()}`;
        return this.fetchWithTimeout(v2Url, headers);
    }

    /**
     * Use the legacy search endpoint for stronger term matching.
     */
    private async fetchSearchResponseLegacy(
        query: string,
        pageSize: number,
        page: number,
        languageCode?: string
    ): Promise<Response> {
        const headers = { 'User-Agent': 'cal-io/food-search' };
        const legacyParams = new URLSearchParams({
            search_terms: query,
            search_simple: '1',
            json: '1',
            action: 'process',
            page_size: String(pageSize),
            page: String(page),
            fields: this.searchFields,
            sort_by: 'unique_scans_n'
        });
        if (languageCode) {
            legacyParams.set('lc', languageCode);
        }
        const legacyUrl = `${this.baseUrl}/cgi/search.pl?${legacyParams.toString()}`;
        return this.fetchWithTimeout(legacyUrl, headers);
    }

    private async fetchProductByBarcode(barcode: string, languageCode?: string): Promise<OpenFoodFactsProduct | null> {
        const params = new URLSearchParams({
            fields: 'product_name,brands,code,nutriments,serving_size,serving_quantity,product_quantity,quantity,lc'
        });
        if (languageCode) {
            params.set('lc', languageCode);
        }
        const headers = { 'User-Agent': 'cal-io/food-search' };
        const response = await this.fetchWithTimeout(
            `${this.baseUrl}/api/v2/product/${encodeURIComponent(barcode)}?${params.toString()}`,
            headers
        );
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
