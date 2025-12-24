import type { HeightUnit, WeightUnit } from '../context/authContext';

export type UnitPreferenceKey = 'CM_KG' | 'FTIN_LB' | 'CM_LB' | 'FTIN_KG';

/**
 * Return a deterministic "combined unit preference" key for a height + weight unit pairing.
 */
export function getUnitPreferenceKey(heightUnit: HeightUnit, weightUnit: WeightUnit): UnitPreferenceKey {
    if (heightUnit === 'CM' && weightUnit === 'KG') return 'CM_KG';
    if (heightUnit === 'FT_IN' && weightUnit === 'LB') return 'FTIN_LB';
    if (heightUnit === 'CM' && weightUnit === 'LB') return 'CM_LB';
    return 'FTIN_KG';
}

/**
 * Decode a combined unit preference key into its height + weight unit parts.
 */
export function parseUnitPreferenceKey(key: UnitPreferenceKey): { heightUnit: HeightUnit; weightUnit: WeightUnit } {
    switch (key) {
        case 'CM_KG':
            return { heightUnit: 'CM', weightUnit: 'KG' };
        case 'FTIN_LB':
            return { heightUnit: 'FT_IN', weightUnit: 'LB' };
        case 'CM_LB':
            return { heightUnit: 'CM', weightUnit: 'LB' };
        case 'FTIN_KG':
            return { heightUnit: 'FT_IN', weightUnit: 'KG' };
    }
}

/**
 * Default height units when none have been chosen yet. We infer from weight units as a sensible
 * starting point, while still allowing "mixed" combos to be selected explicitly.
 */
export function getDefaultHeightUnitForWeightUnit(weightUnit: WeightUnit): HeightUnit {
    return weightUnit === 'LB' ? 'FT_IN' : 'CM';
}

/**
 * Resolve a combined unit preference key from stored (or partially missing) unit preferences.
 */
export function resolveUnitPreferenceKey(preferences: {
    weight_unit?: WeightUnit | null;
    height_unit?: HeightUnit | null;
}): UnitPreferenceKey {
    const weightUnit: WeightUnit = preferences.weight_unit ?? 'KG';
    const heightUnit: HeightUnit = preferences.height_unit ?? getDefaultHeightUnitForWeightUnit(weightUnit);
    return getUnitPreferenceKey(heightUnit, weightUnit);
}
