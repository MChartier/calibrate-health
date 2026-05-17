import {
    ACTIVITY_LEVELS,
    HEIGHT_UNITS,
    SEX_VALUES,
    WEIGHT_UNITS,
    type ActivityLevel,
    type HeightUnit,
    type Sex,
    type WeightUnit
} from '@calibrate/shared';

export const SEX_OPTIONS: Array<{ value: Sex; label: string }> = [
    { value: SEX_VALUES.MALE, label: 'Male' },
    { value: SEX_VALUES.FEMALE, label: 'Female' }
];

export const ACTIVITY_OPTIONS: Array<{ value: ActivityLevel; label: string }> = [
    { value: ACTIVITY_LEVELS.SEDENTARY, label: 'Sedentary' },
    { value: ACTIVITY_LEVELS.LIGHT, label: 'Light' },
    { value: ACTIVITY_LEVELS.MODERATE, label: 'Moderate' },
    { value: ACTIVITY_LEVELS.ACTIVE, label: 'Active' },
    { value: ACTIVITY_LEVELS.VERY_ACTIVE, label: 'Very active' }
];

export const WEIGHT_UNIT_OPTIONS: Array<{ value: WeightUnit; label: string }> = [
    { value: WEIGHT_UNITS.KG, label: 'kg' },
    { value: WEIGHT_UNITS.LB, label: 'lb' }
];

export const HEIGHT_UNIT_OPTIONS: Array<{ value: HeightUnit; label: 'cm' | 'ft/in' }> = [
    { value: HEIGHT_UNITS.CM, label: 'cm' },
    { value: HEIGHT_UNITS.FT_IN, label: 'ft/in' }
];
