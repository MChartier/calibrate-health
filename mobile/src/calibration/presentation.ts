import type { WeightUnit } from '@calibrate/shared';
import type { CalibrationInterval, CalibrationResult } from '@calibrate/shared/calibration';

const POUNDS_PER_KILOGRAM = 2.2046226218;

export function formatCalorieBudgetChange(adjustmentKcal: number): string {
    const magnitude = Math.abs(Math.round(adjustmentKcal)).toLocaleString();
    if (adjustmentKcal < 0) return `${magnitude} kcal less/day`;
    if (adjustmentKcal > 0) return `${magnitude} kcal more/day`;
    return 'No change';
}

export function formatWeightPace(value: CalibrationInterval | null, weightUnit: WeightUnit): string {
    if (!value) return 'Not enough evidence';
    const displayValue = weightUnit === 'LB' ? value.midpoint * POUNDS_PER_KILOGRAM : value.midpoint;
    const sign = displayValue > 0 ? '+' : '';
    return `${sign}${displayValue.toFixed(2)} ${weightUnit === 'LB' ? 'lb' : 'kg'}/week`;
}

export function describeCalibrationEvidence(result: CalibrationResult): string {
    const quality = result.dataQuality;
    if (!result.selectedWindowDays) return 'No observation window selected yet.';
    const uncertainDays = quality.suspiciousDays + quality.missingDays + quality.incompleteDays;
    return `${quality.confidentDays} confident food days | ${quality.weightPoints} weights across ${quality.weightSpanDays} days | ${uncertainDays} uncertain days`;
}
