import type { WeightUnit } from '@calibrate/shared';
import type { CalibrationInterval, CalibrationResult } from '@calibrate/shared/calibration';

const POUNDS_PER_KILOGRAM = 2.2046226218;

export function formatCalorieBudgetInterval(value: CalibrationInterval | null): string {
    if (!value) return 'Not enough evidence';
    if (value.high < 0) {
        return `${Math.abs(Math.round(value.midpoint)).toLocaleString()} kcal lower (${Math.abs(Math.round(value.high)).toLocaleString()} to ${Math.abs(Math.round(value.low)).toLocaleString()})`;
    }
    if (value.low > 0) {
        return `${Math.round(value.midpoint).toLocaleString()} kcal higher (${Math.round(value.low).toLocaleString()} to ${Math.round(value.high).toLocaleString()})`;
    }
    return `Near baseline (${Math.abs(Math.round(value.low)).toLocaleString()} lower to ${Math.round(value.high).toLocaleString()} higher)`;
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
