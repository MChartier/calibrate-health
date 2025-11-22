export const GRAMS_PER_KG = 1000;
export const GRAMS_PER_LB = 453.59237;

export const convertToGrams = (value: number, unit: string): number => {
    if (unit === 'lbs') {
        return Math.round(value * GRAMS_PER_LB);
    }
    // Default to kg if not lbs
    return Math.round(value * GRAMS_PER_KG);
};

export const convertFromGrams = (grams: number, unit: string): number => {
    if (unit === 'lbs') {
        return parseFloat((grams / GRAMS_PER_LB).toFixed(1));
    }
    // Default to kg
    return parseFloat((grams / GRAMS_PER_KG).toFixed(1));
};
