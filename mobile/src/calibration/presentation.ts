import type { CalibrationInterval, CalibrationResult } from '@calibrate/shared';

export function formatCalorieInterval(value: CalibrationInterval | null): string {
    if (!value) return 'Not enough evidence';
    return `${Math.round(value.midpoint).toLocaleString()} kcal (${Math.round(value.low).toLocaleString()}-${Math.round(value.high).toLocaleString()})`;
}

export function formatWeightPace(value: CalibrationInterval | null): string {
    if (!value) return 'Not enough evidence';
    const sign = value.midpoint > 0 ? '+' : '';
    return `${sign}${value.midpoint.toFixed(2)} kg/week`;
}

export function describeCalibrationEvidence(result: CalibrationResult): string {
    const quality = result.dataQuality;
    if (!result.selectedWindowDays) return 'No observation window selected yet.';
    return `${quality.confidentDays} confident food days | ${quality.weightPoints} weights across ${quality.weightSpanDays} days | ${quality.missingDays + quality.incompleteDays} uncertain days`;
}
