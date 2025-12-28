import { Nutrients } from './types';

export const round = (value: number, precision = 2): number => {
    const multiplier = Math.pow(10, precision);
    return Math.round(value * multiplier) / multiplier;
};

export const scaleNutrients = (nutrients: Nutrients, factor: number): Nutrients => {
    return {
        calories: round(nutrients.calories * factor, 1),
        protein: nutrients.protein !== undefined ? round(nutrients.protein * factor, 2) : undefined,
        fat: nutrients.fat !== undefined ? round(nutrients.fat * factor, 2) : undefined,
        carbs: nutrients.carbs !== undefined ? round(nutrients.carbs * factor, 2) : undefined
    };
};

export const parseNumber = (value: unknown): number | undefined => {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === 'string') {
        const parsed = parseFloat(value);
        if (Number.isFinite(parsed)) {
            return parsed;
        }
    }
    return undefined;
};
