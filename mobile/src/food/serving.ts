import type { FoodLogCreatePayload } from '@calibrate/api-client';
import type { MealPeriod } from '@calibrate/shared';

export type ProviderFoodMeasure = {
    label: string;
    gramWeight: number;
    quantity: number | null;
    unit: string | null;
};

export type SearchedFoodItem = {
    id: string;
    name: string;
    source: string | null;
    brand: string | null;
    barcode: string | null;
    locale: string | null;
    measures: ProviderFoodMeasure[];
    caloriesPer100g: number | null;
};

export type FoodServingCalculation = {
    quantity: number;
    calories: number;
    caloriesPerMeasure: number;
    gramsPerMeasure: number;
    gramsTotal: number;
};

export type FoodServingPayloadResult =
    | { ok: true; payload: FoodLogCreatePayload; calculation: FoodServingCalculation }
    | { ok: false; message: string };

const roundTo = (value: number, decimalPlaces: number): number => {
    const scale = 10 ** decimalPlaces;
    return Math.round((value + Number.EPSILON) * scale) / scale;
};

const optionalText = (value: unknown): string | null => {
    if (typeof value !== 'string') return null;
    const trimmed = value.trim();
    return trimmed || null;
};

const optionalPositiveNumber = (value: unknown): number | null =>
    typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;

const optionalNonNegativeNumber = (value: unknown): number | null =>
    typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;

/** Normalize the provider wire object without trusting optional third-party fields. */
export function normalizeSearchedFoodItem(value: unknown): SearchedFoodItem | null {
    if (!value || typeof value !== 'object') return null;
    const record = value as Record<string, unknown>;
    const id = optionalText(record.id);
    const name = optionalText(record.description) ?? optionalText(record.name);
    if (!id || !name) return null;

    let rawMeasures: unknown[] = [];
    if (Array.isArray(record.availableMeasures)) {
        rawMeasures = record.availableMeasures;
    } else if (Array.isArray(record.measures)) {
        rawMeasures = record.measures;
    }
    const measures = rawMeasures.flatMap((rawMeasure): ProviderFoodMeasure[] => {
        if (!rawMeasure || typeof rawMeasure !== 'object') return [];
        const measure = rawMeasure as Record<string, unknown>;
        const label = optionalText(measure.label);
        const gramWeight = optionalPositiveNumber(measure.gramWeight);
        if (!label || !gramWeight) return [];
        return [{
            label,
            gramWeight,
            quantity: optionalPositiveNumber(measure.quantity),
            unit: optionalText(measure.unit)
        }];
    });

    const nutrients = record.nutrientsPer100g;
    const caloriesPer100g = nutrients && typeof nutrients === 'object'
        ? optionalNonNegativeNumber((nutrients as Record<string, unknown>).calories)
        : null;

    return {
        id,
        name,
        source: optionalText(record.source),
        brand: optionalText(record.brand),
        barcode: optionalText(record.barcode),
        locale: optionalText(record.locale),
        measures,
        caloriesPer100g
    };
}

/** Prefer a practical serving over a provider's generic per-100g measure. */
export function getPreferredFoodMeasureIndex(item: SearchedFoodItem): number | null {
    if (item.measures.length === 0) return null;
    const practicalIndex = item.measures.findIndex(
        (measure) => measure.label.trim().toLowerCase() !== 'per 100g'
    );
    return practicalIndex >= 0 ? practicalIndex : 0;
}

/** Scale provider per-100g energy into the selected measure and user-entered quantity. */
export function calculateFoodServing(
    item: SearchedFoodItem,
    measure: ProviderFoodMeasure,
    quantity: number
): FoodServingCalculation | null {
    if (!Number.isFinite(quantity) || quantity <= 0 || item.caloriesPer100g === null) return null;

    const gramsPerMeasure = roundTo(measure.gramWeight, 3);
    const gramsTotal = roundTo(gramsPerMeasure * quantity, 3);
    const caloriesPerMeasure = roundTo((item.caloriesPer100g * gramsPerMeasure) / 100, 1);
    const caloriesTotal = (item.caloriesPer100g * gramsTotal) / 100;
    return {
        quantity,
        calories: Math.round(caloriesTotal),
        caloriesPerMeasure,
        gramsPerMeasure,
        gramsTotal
    };
}

const getServingUnitLabel = (measure: ProviderFoodMeasure): string =>
    measure.unit ?? measure.label.replace(/^per\s+/i, '').trim();

/** Build an immutable external-food snapshot from one deterministic serving calculation. */
export function buildSearchedFoodLogPayload(options: {
    item: SearchedFoodItem;
    measure: ProviderFoodMeasure | null;
    quantity: number;
    date: string;
    meal: MealPeriod;
}): FoodServingPayloadResult {
    if (!options.measure) {
        return { ok: false, message: 'This food does not include a usable serving measure.' };
    }
    if (!Number.isFinite(options.quantity) || options.quantity <= 0) {
        return { ok: false, message: 'Quantity must be a positive number.' };
    }

    const calculation = calculateFoodServing(options.item, options.measure, options.quantity);
    if (!calculation) {
        return { ok: false, message: 'This food does not include enough nutrition data to calculate calories.' };
    }

    return {
        ok: true,
        calculation,
        payload: {
            date: options.date,
            meal_period: options.meal,
            name: options.item.name,
            calories: calculation.calories,
            servings_consumed: calculation.quantity,
            serving_size_quantity_snapshot: options.measure.quantity ?? 1,
            serving_unit_label_snapshot: getServingUnitLabel(options.measure),
            calories_per_serving_snapshot: calculation.caloriesPerMeasure,
            external_source: options.item.source,
            external_id: options.item.id,
            brand: options.item.brand,
            locale: options.item.locale,
            barcode: options.item.barcode,
            measure_label: options.measure.label,
            grams_per_measure_snapshot: calculation.gramsPerMeasure,
            measure_quantity_snapshot: calculation.quantity,
            grams_total_snapshot: calculation.gramsTotal
        }
    };
}
