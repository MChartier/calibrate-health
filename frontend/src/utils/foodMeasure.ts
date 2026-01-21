import type { FoodMeasure, NormalizedFoodItem } from '../types/food';

const PER_100G_LABEL = 'per 100g'; // Default measure label supplied by providers for per-100g nutrient scaling.

const normalizeMeasureLabel = (label: string | undefined): string => {
    return label?.trim().toLowerCase() ?? '';
};

const isPer100gMeasure = (measure: FoodMeasure): boolean => {
    return normalizeMeasureLabel(measure.label) === PER_100G_LABEL;
};

/**
 * Prefer non-100g serving sizes so default UI emphasizes practical portion sizes.
 */
export const getPreferredMeasure = (item: NormalizedFoodItem): FoodMeasure | null => {
    const measures = item.availableMeasures ?? [];
    const withWeight = measures.filter((measure) => measure.gramWeight);
    if (withWeight.length === 0) {
        return null;
    }

    const nonPer100g = withWeight.find((measure) => !isPer100gMeasure(measure));
    return nonPer100g ?? withWeight[0] ?? null;
};

/**
 * Return the label for the preferred measure so selection can prefill cleanly.
 */
export const getPreferredMeasureLabel = (item: NormalizedFoodItem): string | null => {
    return getPreferredMeasure(item)?.label ?? null;
};

/**
 * Normalize measure labels so "per serving" becomes "serving" in summaries.
 */
export const formatMeasureLabelForDisplay = (label: string): string => {
    const trimmed = label.trim();
    if (normalizeMeasureLabel(trimmed).startsWith('per ')) {
        return trimmed.slice(4).trim();
    }
    return trimmed;
};

/**
 * Build a display string that preserves the chosen serving size and quantity.
 */
export const formatMeasureLabelWithQuantity = (label: string, quantity: number): string => {
    const base = formatMeasureLabelForDisplay(label);
    if (!Number.isFinite(quantity) || quantity <= 0) {
        return base;
    }
    const startsWithNumber = /^\d/.test(base);
    if (quantity === 1) {
        return startsWithNumber ? base : `1 ${base}`;
    }
    return `${quantity} x ${base}`;
};

/**
 * Scale per-100g nutrients into a specific measure and quantity.
 */
export const getMeasureCalories = (
    item: NormalizedFoodItem,
    measure: FoodMeasure,
    quantity = 1
): { grams: number; calories: number } | null => {
    if (!item.nutrientsPer100g || !measure.gramWeight) {
        return null;
    }
    if (!Number.isFinite(quantity) || quantity <= 0) {
        return null;
    }

    const grams = measure.gramWeight * quantity;
    const caloriesTotal = (item.nutrientsPer100g.calories * grams) / 100;
    return {
        grams,
        calories: Math.round(caloriesTotal * 10) / 10
    };
};
