import {
    HEIGHT_UNITS,
    WEIGHT_UNITS,
    type ActivityLevel,
    type HeightUnit,
    type WeightUnit
} from '@calibrate/shared';
import type {
    OnboardingCompleteData,
    OnboardingDraft,
    OnboardingDraftData
} from '@calibrate/api-client';
import type { GoalMode } from '../utils/goals';
import type { OnboardingStepKey } from './steps';

const GRAMS_PER_KILOGRAM = 1_000;
const GRAMS_PER_POUND = 453.59237;
const MILLIMETERS_PER_CENTIMETER = 10;
const MILLIMETERS_PER_INCH = 25.4;
const INCHES_PER_FOOT = 12;

export const ONBOARDING_DRAFT_SCHEMA_VERSION = 1 as const;

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

type DraftDefaults = Pick<OnboardingFormState, 'weightUnit' | 'heightUnit' | 'timezone'>;

export type HydratedOnboardingDraft = OnboardingFormState & {
    resumeStep: Exclude<OnboardingStepKey, 'health' | 'watch'>;
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

function gramsToDisplayWeight(grams: number | undefined, unit: WeightUnit): string {
    if (grams === undefined) return '';
    const divisor = unit === WEIGHT_UNITS.LB ? GRAMS_PER_POUND : GRAMS_PER_KILOGRAM;
    return (grams / divisor).toFixed(1);
}

function millimetersToMetricHeight(mm: number | undefined): string {
    return mm === undefined ? '' : (mm / MILLIMETERS_PER_CENTIMETER).toFixed(1);
}

function millimetersToImperialHeight(mm: number | undefined): { feet: string; inches: string } {
    if (mm === undefined) return { feet: '', inches: '' };
    const totalInches = Math.round(mm / MILLIMETERS_PER_INCH);
    return {
        feet: String(Math.floor(totalInches / INCHES_PER_FOOT)),
        inches: String(totalInches % INCHES_PER_FOOT)
    };
}

function resolveGoalMode(data: OnboardingDraftData): GoalMode {
    if (data.daily_deficit !== undefined) {
        if (data.daily_deficit > 0) return 'lose';
        if (data.daily_deficit < 0) return 'gain';
        return 'maintain';
    }
    if (
        data.current_weight_grams !== undefined
        && data.target_weight_grams !== undefined
        && data.target_weight_grams > data.current_weight_grams
    ) {
        return 'gain';
    }
    if (
        data.current_weight_grams !== undefined
        && data.target_weight_grams === data.current_weight_grams
    ) {
        return 'maintain';
    }
    return 'lose';
}

function completedSectionRank(step: OnboardingStepKey): number {
    switch (step) {
        case 'goal':
            return 1;
        case 'about':
            return 2;
        case 'burn':
            return 3;
        case 'pace':
        case 'review':
        case 'import':
            return 4;
        case 'health':
        case 'watch':
            return 0;
    }
}

/** Persist only validated sections so defaults from later steps do not look user-approved. */
export function buildOnboardingDraftData(
    form: OnboardingFormState,
    completedThrough: OnboardingStepKey
): OnboardingDraftData {
    const rank = completedSectionRank(completedThrough);
    const data: OnboardingDraftData = {
        weight_unit: form.weightUnit,
        height_unit: form.heightUnit
    };
    if (rank >= 1) {
        data.current_weight_grams = displayWeightToGrams(form.currentWeight, form.weightUnit);
        data.target_weight_grams = displayWeightToGrams(form.targetWeight, form.weightUnit);
    }
    if (rank >= 2) {
        data.date_of_birth = form.dateOfBirth.trim();
        if (form.sex) data.sex = form.sex;
    }
    if (rank >= 3) {
        data.timezone = form.timezone.trim();
        if (form.activityLevel) data.activity_level = form.activityLevel;
        data.height_mm = heightToMillimeters(form);
    }
    if (rank >= 4) {
        data.daily_deficit = form.goalMode === 'maintain'
            ? 0
            : (form.goalMode === 'gain' ? -1 : 1) * Math.abs(Number(form.dailyChangeAbs));
    }
    return data;
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

/** Canonical server values hydrate display fields without cross-device unit drift. */
export function hydrateOnboardingDraft(
    draft: OnboardingDraft,
    defaults: DraftDefaults
): HydratedOnboardingDraft {
    const data = draft.data;
    const weightUnit = data.weight_unit ?? defaults.weightUnit;
    const heightUnit = data.height_unit ?? defaults.heightUnit;
    const imperialHeight = millimetersToImperialHeight(data.height_mm);
    const currentWeight = gramsToDisplayWeight(data.current_weight_grams, weightUnit);
    const targetWeight = gramsToDisplayWeight(data.target_weight_grams, weightUnit);
    const goalMode = resolveGoalMode(data);
    const resumeStep = draft.current_step === 'import'
        ? 'review'
        : (draft.current_step ?? 'goal');

    return {
        weightUnit,
        heightUnit,
        timezone: data.timezone ?? defaults.timezone,
        dateOfBirth: data.date_of_birth ?? '',
        sex: data.sex ?? null,
        activityLevel: data.activity_level ?? null,
        currentWeight,
        targetWeight: goalMode === 'maintain' && !targetWeight ? currentWeight : targetWeight,
        goalMode,
        dailyChangeAbs: data.daily_deficit === undefined
            ? '500'
            : String(Math.abs(data.daily_deficit)),
        heightCm: millimetersToMetricHeight(data.height_mm),
        heightFeet: imperialHeight.feet,
        heightInches: imperialHeight.inches,
        resumeStep
    };
}
