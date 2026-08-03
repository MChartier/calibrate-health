import type { WeightUnit } from '@calibrate/shared';
import {
    CALIBRATION_MAX_ADJUSTMENT_STEP_KCAL,
    type CalibrationInterval,
    type CalibrationResult
} from '@calibrate/shared/calibration';

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
    recommendedStepKcal: number,
    recommendedTargetKcal?: number
): {
    signal: string;
    range: string;
    firstStepLabel: string;
    firstStep: string;
} | null {
    if (!value || recommendedStepKcal === 0) return null;

    const relativeLow = value.low - currentAdjustmentKcal;
    const relativeMidpoint = value.midpoint - currentAdjustmentKcal;
    const relativeHigh = value.high - currentAdjustmentKcal;
    const direction = recommendedStepKcal < 0 ? 'lower' : 'higher';
    const estimatedMagnitude = Math.abs(Math.round(relativeMidpoint)).toLocaleString();
    const rangeLow = recommendedStepKcal < 0 ? Math.abs(Math.round(relativeHigh)) : Math.round(relativeLow);
    const rangeHigh = recommendedStepKcal < 0 ? Math.abs(Math.round(relativeLow)) : Math.round(relativeHigh);
    const firstStep = Math.abs(Math.round(recommendedStepKcal)).toLocaleString();
    const evidenceStep = Math.round(
        Math.min(Math.abs(relativeMidpoint), CALIBRATION_MAX_ADJUSTMENT_STEP_KCAL) / 25
    ) * 25;
    const isSafetyLimited = recommendedStepKcal < 0 && Math.abs(recommendedStepKcal) < evidenceStep;

    return {
        signal: `Based on this history, a budget about ${estimatedMagnitude} kcal ${direction} than your current budget could bring your pace closer to plan if the recent pattern continues.`,
        range: `The estimate could reasonably be ${rangeLow.toLocaleString()}-${rangeHigh.toLocaleString()} kcal ${direction}.`,
        firstStepLabel: isSafetyLimited ? 'Safety limit' : 'Recommended first step',
        firstStep: isSafetyLimited && recommendedTargetKcal
            ? `Calibrate's BMR-based limit caps this suggestion at ${recommendedTargetKcal.toLocaleString()} kcal, so the proposed change is ${firstStep} kcal less per day. Calibrate will not suggest a lower budget.`
            : `Food logs and short-term scale trends are imperfect, so Calibrate limits this first change to ${firstStep} kcal per day to avoid overcorrecting. Your next pace check will use the new trend before suggesting another change.`
    };
}

function countLabel(count: number, singular: string, plural = `${singular}s`): string {
    return `${count} ${count === 1 ? singular : plural}`;
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
    return `${countLabel(quality.confidentDays, 'well-tracked food day')} | ${countLabel(quality.weightPoints, 'weigh-in')} across ${countLabel(quality.weightSpanDays, 'day')} | ${countLabel(uncertainDays, 'day')} with uncertain food logs`;
}

export function describeCalibrationEvidenceForReview(result: CalibrationResult): string {
    const quality = result.dataQuality;
    const uncertainDays = quality.suspiciousDays + quality.missingDays + quality.incompleteDays;
    const foodDayLabel = quality.confidentDays === 1 ? 'day' : 'days';
    const weighInLabel = quality.weightPoints === 1 ? 'weigh-in' : 'weigh-ins';
    const spanDayLabel = quality.weightSpanDays === 1 ? 'day' : 'days';
    const base = `This review uses ${quality.confidentDays} well-tracked food ${foodDayLabel} and ${quality.weightPoints} ${weighInLabel} across ${quality.weightSpanDays} ${spanDayLabel}.`;
    if (uncertainDays === 0) return base;
    const uncertainLabel = uncertainDays === 1 ? 'day' : 'days';
    const verb = uncertainDays === 1 ? 'was' : 'were';
    return `${base} ${uncertainDays} ${uncertainLabel} with incomplete or uncertain intake ${verb} included as a wider range, not ignored.`;
}
