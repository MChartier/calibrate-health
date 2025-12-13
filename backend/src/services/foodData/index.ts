import OpenFoodFactsProvider from './openFoodFactsProvider';
import UsdaFoodDataProvider from './usdaFoodDataProvider';
import { FoodDataProvider } from './types';

let providerInstance: FoodDataProvider | null = null;

export const getFoodDataProvider = (): FoodDataProvider => {
    if (providerInstance) {
        return providerInstance;
    }

    const requested = (process.env.FOOD_DATA_PROVIDER || 'openfoodfacts').toLowerCase();
    if (requested === 'usda') {
        const apiKey = process.env.USDA_API_KEY;
        if (!apiKey) {
            console.warn('FOOD_DATA_PROVIDER=usda, but USDA_API_KEY is missing. Falling back to Open Food Facts.');
        } else {
            providerInstance = new UsdaFoodDataProvider(apiKey);
            return providerInstance;
        }
    }

    providerInstance = new OpenFoodFactsProvider();
    return providerInstance;
};

export * from './types';
