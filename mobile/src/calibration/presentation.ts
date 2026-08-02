import type { WeightUnit } from '@calibrate/shared';
import type { CalibrationInterval, CalibrationResult } from '@calibrate/shared/calibration';

const POUNDS_PER_KILOGRAM = 2.2046226218;

export function describeCalorieBudgetChange(adjustmentKcal: number, currentTargetKcal: number): string {
    const magnitude = Math.abs(Math.round(adjustmentKcal)).toLocaleString();
    const currentBudget = Math.round(currentTargetKcal).toLocaleString();
    if (adjustmentKcal < 0) return `${magnitude} kcal less than your current ${currentBudget} kcal budget.`;
    if (adjustmentKcal > 0) return `${magnitude} kcal more than your current ${currentBudget} kcal budget.`;
    return `Your current ${currentBudget} kcal budget would stay the same.`;
}

export function describeCalorieBudgetEstimate(
    value: CalibrationInterval | null,
    currentAdjustmentKcal: number,
    recommendedStepKcal: number
): string | null {
    if (!value || recommendedStepKcal === 0) return null;

    const relativeLow = value.low - currentAdjustmentKcal;
    const relativeMidpoint = value.midpoint - currentAdjustmentKcal;
    const relativeHigh = value.high - currentAdjustmentKcal;
    const direction = recommendedStepKcal < 0 ? 'lower' : 'higher';
    const estimatedMagnitude = Math.abs(Math.round(relativeMidpoint)).toLocaleString();
    const rangeLow = recommendedStepKcal < 0 ? Math.abs(Math.round(relativeHigh)) : Math.round(relativeLow);
    const rangeHigh = recommendedStepKcal < 0 ? Math.abs(Math.round(relativeLow)) : Math.round(relativeHigh);
    const firstStep = Math.abs(Math.round(recommendedStepKcal)).toLocaleString();

    return `The model estimates that a daily budget about ${estimatedMagnitude} kcal ${direction} would better match the relationship between your logged intake and weight trend. Food logs and short-term weight trends always contain some uncertainty, so the plausible adjustment is ${rangeLow.toLocaleString()}-${rangeHigh.toLocaleString()} kcal ${direction}. Calibrate recommends a smaller first step of ${firstStep} kcal per day to avoid overcorrecting. Your next pace check will incorporate the new data.`;
}

export function formatWeightPaceMagnitude(valueKgPerWeek: number | null, weightUnit: WeightUnit): string {
    if (valueKgPerWeek === null) return 'Not enough evidence';
    const displayValue = weightUnit === 'LB' ? valueKgPerWeek * POUNDS_PER_KILOGRAM : valueKgPerWeek;
    return `${Math.abs(displayValue).toFixed(2)} ${weightUnit === 'LB' ? 'lb' : 'kg'}/week`;
}

export function describeWeightPaceDirection(valueKgPerWeek: number): 'loss' | 'gain' | 'stable' {
    if (valueKgPerWeek < -0.01) return 'loss';
    if (valueKgPerWeek > 0.01) return 'gain';
    return 'stable';
}

export function describeCalibrationEvidence(result: CalibrationResult): string {
    const quality = result.dataQuality;
    if (!result.selectedWindowDays) return 'No observation window selected yet.';
    const uncertainDays = quality.suspiciousDays + quality.missingDays + quality.incompleteDays;
    return `${quality.confidentDays} confident food days | ${quality.weightPoints} weights across ${quality.weightSpanDays} days | ${uncertainDays} uncertain days`;
}

export function describeCalibrationEvidenceForReview(result: CalibrationResult): string {
    const quality = result.dataQuality;
    const uncertainDays = quality.suspiciousDays + quality.missingDays + quality.incompleteDays;
    const foodDayLabel = quality.confidentDays === 1 ? 'day' : 'days';
    const weighInLabel = quality.weightPoints === 1 ? 'weigh-in' : 'weigh-ins';
    const base = `This review uses ${quality.confidentDays} well-tracked food ${foodDayLabel} and ${quality.weightPoints} ${weighInLabel} across ${quality.weightSpanDays} days.`;
    if (uncertainDays === 0) return base;
    const uncertainLabel = uncertainDays === 1 ? 'day' : 'days';
    const verb = uncertainDays === 1 ? 'was' : 'were';
    return `${base} ${uncertainDays} ${uncertainLabel} with incomplete or uncertain intake ${verb} included as a wider range, not ignored.`;
}
