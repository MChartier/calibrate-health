import {
    HEIGHT_UNITS,
    WEIGHT_UNITS,
    type ActivityLevel,
    type HeightUnit,
    type WeightUnit
} from '@calibrate/shared';
import type { OnboardingCompleteData } from '@calibrate/api-client';
import type { GoalMode } from '../utils/goals';

const GRAMS_PER_KILOGRAM = 1_000;
const GRAMS_PER_POUND = 453.59237;
const MILLIMETERS_PER_CENTIMETER = 10;
const MILLIMETERS_PER_INCH = 25.4;
const INCHES_PER_FOOT = 12;

export type OnboardingFormState = {
    weightUnit: WeightUnit;
    heightUnit: HeightUnit;
    timezone: string;
    dateOfBirth: string;
    sex: 'MALE' | 'FEMALE' | null;
    activityLevel: ActivityLevel | null;
    currentWeight: string;
    targetWeight: string;
    goalMode: GoalMode;
    dailyChangeAbs: string;
    heightCm: string;
    heightFeet: string;
    heightInches: string;
};

function displayWeightToGrams(value: string, unit: WeightUnit): number {
    const parsed = Number(value);
    return Math.round(parsed * (unit === WEIGHT_UNITS.LB ? GRAMS_PER_POUND : GRAMS_PER_KILOGRAM));
}

function heightToMillimeters(form: OnboardingFormState): number {
    if (form.heightUnit === HEIGHT_UNITS.CM) {
        return Math.round(Number(form.heightCm) * MILLIMETERS_PER_CENTIMETER);
    }
    const inches = (Number(form.heightFeet) * INCHES_PER_FOOT) + Number(form.heightInches || '0');
    return Math.round(inches * MILLIMETERS_PER_INCH);
}

export function buildOnboardingCompleteData(form: OnboardingFormState): OnboardingCompleteData {
    return {
        weight_unit: form.weightUnit,
        height_unit: form.heightUnit,
        timezone: form.timezone.trim(),
        date_of_birth: form.dateOfBirth.trim(),
        sex: form.sex!,
        height_mm: heightToMillimeters(form),
        activity_level: form.activityLevel!,
        current_weight_grams: displayWeightToGrams(form.currentWeight, form.weightUnit),
        target_weight_grams: displayWeightToGrams(form.targetWeight, form.weightUnit),
        daily_deficit: form.goalMode === 'maintain'
            ? 0
            : (form.goalMode === 'gain' ? -1 : 1) * Math.abs(Number(form.dailyChangeAbs))
    };
}