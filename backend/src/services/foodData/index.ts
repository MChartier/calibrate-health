import FatSecretFoodDataProvider from './fatSecretProvider';
import OpenFoodFactsProvider from './openFoodFactsProvider';
import UsdaFoodDataProvider from './usdaFoodDataProvider';
import { FoodDataProvider, FoodDataSource } from './types';

/**
 * Food data provider registry and resolver helpers.
 */
type FoodDataProviderConfig = {
    label: string;
    supportsBarcodeLookup: boolean;
    requiredEnvVars?: string[];
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
    fatsecret: {
        label: 'FatSecret',
        supportsBarcodeLookup: true,
        requiredEnvVars: ['FATSECRET_CLIENT_ID', 'FATSECRET_CLIENT_SECRET']
    },
    usda: {
        label: 'USDA FoodData Central',
        supportsBarcodeLookup: true,
        requiredEnvVars: ['USDA_API_KEY']
    },
    openFoodFacts: {
        label: 'Open Food Facts',
        supportsBarcodeLookup: true
    }
};

const providerCache: Partial<Record<FoodDataSource, FoodDataProvider>> = {};
let providerInstance: FoodDataProvider | null = null;

const normalizeProviderName = (value: string): FoodDataSource | null => {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'fatsecret') {
        return 'fatsecret';
    }
    if (normalized === 'usda') {
        return 'usda';
    }
    if (normalized === 'openfoodfacts') {
        return 'openFoodFacts';
    }
    return null;
};

const hasEnvValue = (key: string): boolean => {
    const value = process.env[key];
    return typeof value === 'string' && value.trim().length > 0;
};

const getMissingProviderEnvVars = (name: FoodDataSource): string[] => {
    const required = providerRegistry[name].requiredEnvVars ?? [];
    return required.filter((key) => !hasEnvValue(key));
};

const formatMissingEnvDetail = (missing: string[]): string => `Missing ${missing.join(', ')}`;

const formatMissingEnvSentence = (missing: string[]): string => {
    if (missing.length === 1) {
        return `${missing[0]} is missing`;
    }
    return `${missing.join(', ')} are missing`;
};

/**
 * Resolve a provider by name, returning a friendly error when configuration is missing.
 */
export const getFoodDataProviderByName = (name: FoodDataSource): FoodDataProviderResolution => {
    const cached = providerCache[name];
    if (cached) {
        return { provider: cached };
    }

    const missing = getMissingProviderEnvVars(name);
    if (missing.length > 0) {
        const config = providerRegistry[name];
        const suffix = missing.length === 1 ? 'Configure it' : 'Configure them';
        return {
            error: `${formatMissingEnvSentence(missing)}. ${suffix} to use ${config.label}.`
        };
    }

    if (name === 'usda') {
        const provider = new UsdaFoodDataProvider(process.env.USDA_API_KEY as string);
        providerCache[name] = provider;
        return { provider };
    }

    if (name === 'fatsecret') {
        const provider = new FatSecretFoodDataProvider(
            process.env.FATSECRET_CLIENT_ID as string,
            process.env.FATSECRET_CLIENT_SECRET as string
        );
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
        const missing = getMissingProviderEnvVars(name);
        if (missing.length > 0) {
            return {
                name,
                label: config.label,
                supportsBarcodeLookup: config.supportsBarcodeLookup,
                ready: false,
                detail: formatMissingEnvDetail(missing)
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

    const requestedRaw = process.env.FOOD_DATA_PROVIDER;
    const requested = (requestedRaw || 'fatsecret').toLowerCase();
    let normalized = normalizeProviderName(requested);

    if (!normalized) {
        console.warn(
            `FOOD_DATA_PROVIDER=${requestedRaw ?? requested} is not recognized. ` +
                'Set FOOD_DATA_PROVIDER to fatsecret, usda, or openfoodfacts. Falling back to FatSecret.'
        );
        normalized = 'fatsecret';
    }

    const resolution = getFoodDataProviderByName(normalized);
    if (resolution.provider) {
        providerInstance = resolution.provider;
        return providerInstance;
    }

    const missing = getMissingProviderEnvVars(normalized);
    if (missing.length > 0) {
        const config = providerRegistry[normalized];
        const action = missing.length === 1
            ? `Set ${missing[0]} to enable ${config.label}.`
            : `Set ${missing.join(', ')} to enable ${config.label}.`;
        console.warn(
            `FOOD_DATA_PROVIDER=${requestedRaw ?? requested}, but ${formatMissingEnvSentence(missing)}. ` +
                `${action} Falling back to Open Food Facts.`
        );
    } else {
        console.warn(
            `FOOD_DATA_PROVIDER=${requestedRaw ?? requested} failed to initialize. ` +
                'Check the provider configuration and credentials. Falling back to Open Food Facts.'
        );
    }

    const fallback = getFoodDataProviderByName('openFoodFacts');
    providerInstance = fallback.provider ?? new OpenFoodFactsProvider();
    return providerInstance;
};

export * from './types';
