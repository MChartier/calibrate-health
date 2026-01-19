import OpenFoodFactsProvider from './openFoodFactsProvider';
import UsdaFoodDataProvider from './usdaFoodDataProvider';
import { FoodDataProvider, FoodDataSource } from './types';

/**
 * Food data provider registry and resolver helpers.
 */
type FoodDataProviderConfig = {
    label: string;
    supportsBarcodeLookup: boolean;
    requiresApiKey?: boolean;
};

export type FoodDataProviderInfo = {
    name: FoodDataSource;
    label: string;
    supportsBarcodeLookup: boolean;
    ready: boolean;
    detail?: string;
};

type FoodDataProviderResolution = {
    provider?: FoodDataProvider;
    error?: string;
};

const providerRegistry: Record<FoodDataSource, FoodDataProviderConfig> = {
    openFoodFacts: {
        label: 'Open Food Facts',
        supportsBarcodeLookup: true
    },
    usda: {
        label: 'USDA FoodData Central',
        supportsBarcodeLookup: true,
        requiresApiKey: true
    }
};

const providerCache: Partial<Record<FoodDataSource, FoodDataProvider>> = {};
let providerInstance: FoodDataProvider | null = null;

/**
 * Resolve a provider by name, returning a friendly error when configuration is missing.
 */
export const getFoodDataProviderByName = (name: FoodDataSource): FoodDataProviderResolution => {
    const cached = providerCache[name];
    if (cached) {
        return { provider: cached };
    }

    if (name === 'usda') {
        const apiKey = process.env.USDA_API_KEY;
        if (!apiKey) {
            return { error: 'USDA_API_KEY is missing. Configure it to use the USDA provider.' };
        }
        const provider = new UsdaFoodDataProvider(apiKey);
        providerCache[name] = provider;
        return { provider };
    }

    const provider = new OpenFoodFactsProvider();
    providerCache[name] = provider;
    return { provider };
};

/**
 * List provider metadata for the dev dashboard without forcing instantiation.
 */
export const listFoodDataProviders = (): FoodDataProviderInfo[] => {
    return (Object.keys(providerRegistry) as FoodDataSource[]).map((name) => {
        const config = providerRegistry[name];
        if (config.requiresApiKey && !process.env.USDA_API_KEY) {
            return {
                name,
                label: config.label,
                supportsBarcodeLookup: config.supportsBarcodeLookup,
                ready: false,
                detail: 'Missing USDA_API_KEY'
            };
        }

        return {
            name,
            label: config.label,
            supportsBarcodeLookup: config.supportsBarcodeLookup,
            ready: true
        };
    });
};

/**
 * Resolve the configured primary food data provider with a safe fallback.
 */
export const getFoodDataProvider = (): FoodDataProvider => {
    if (providerInstance) {
        return providerInstance;
    }

    const requested = (process.env.FOOD_DATA_PROVIDER || 'openfoodfacts').toLowerCase();
    if (requested === 'usda') {
        const resolution = getFoodDataProviderByName('usda');
        if (resolution.provider) {
            providerInstance = resolution.provider;
            return providerInstance;
        }
        console.warn('FOOD_DATA_PROVIDER=usda, but USDA_API_KEY is missing. Falling back to Open Food Facts.');
    }

    const fallback = getFoodDataProviderByName('openFoodFacts');
    providerInstance = fallback.provider ?? new OpenFoodFactsProvider();
    return providerInstance;
};

export * from './types';
