import { ActivityLevel, Sex } from '@prisma/client';

export type ProfileInput = {
    date_of_birth?: Date | null;
    sex?: Sex | null;
    height_mm?: number | null;
    activity_level?: ActivityLevel | null;
};

const activityMultipliers: Record<ActivityLevel, number> = {
    SEDENTARY: 1.2,
    LIGHT: 1.375,
    MODERATE: 1.55,
    ACTIVE: 1.725,
    VERY_ACTIVE: 1.9
};

export const isSex = (value: unknown): value is Sex => value === 'MALE' || value === 'FEMALE';

export const isActivityLevel = (value: unknown): value is ActivityLevel =>
    value === 'SEDENTARY' ||
    value === 'LIGHT' ||
    value === 'MODERATE' ||
    value === 'ACTIVE' ||
    value === 'VERY_ACTIVE';

export const calculateAge = (dateOfBirth: Date): number => {
    const now = new Date();
    let age = now.getFullYear() - dateOfBirth.getFullYear();
    const monthDiff = now.getMonth() - dateOfBirth.getMonth();
    const dayDiff = now.getDate() - dateOfBirth.getDate();
    if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
        age -= 1;
    }
    return age;
};

export const calculateBmr = (sex: Sex, weightKg: number, heightCm: number, ageYears: number): number => {
    const base = 10 * weightKg + 6.25 * heightCm - 5 * ageYears;
    return Math.round((sex === 'MALE' ? base + 5 : base - 161) * 10) / 10;
};

export const activityMultiplier = (activityLevel: ActivityLevel): number => activityMultipliers[activityLevel];

export const gramsToKg = (grams: number): number => Math.round((grams / 1000) * 100) / 100;

export type CalorieSummary = {
    bmr?: number;
    tdee?: number;
    dailyCalorieTarget?: number;
    missing: string[];
    sourceWeightKg?: number;
    deficit?: number | null;
};

export const buildCalorieSummary = (opts: {
    weight_grams?: number | null;
    profile: ProfileInput;
    daily_deficit?: number | null;
}): CalorieSummary => {
    const missing: string[] = [];
    const { weight_grams, profile, daily_deficit } = opts;
    const { sex, date_of_birth, height_mm, activity_level } = profile;

    if (!weight_grams) missing.push('latest_weight');
    if (!sex) missing.push('sex');
    if (!date_of_birth) missing.push('date_of_birth');
    if (!height_mm) missing.push('height_mm');
    if (!activity_level) missing.push('activity_level');

    if (missing.length > 0) {
        return { missing };
    }

    const age = calculateAge(date_of_birth!);
    const weightKg = gramsToKg(weight_grams!);
    const bmr = calculateBmr(sex!, weightKg, height_mm! / 10, age);
    const tdee = Math.round(bmr * activityMultiplier(activity_level!) * 10) / 10;

    const summary: CalorieSummary = { bmr, tdee, missing, sourceWeightKg: weightKg, deficit: daily_deficit ?? null };
    if (typeof daily_deficit === 'number') {
        summary.dailyCalorieTarget = Math.max(Math.round((tdee - daily_deficit) * 10) / 10, 0);
    }

    return summary;
};
