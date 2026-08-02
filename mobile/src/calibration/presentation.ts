import type { CalibrationInterval, CalibrationResult } from '@calibrate/shared';

export function formatCalorieBudgetInterval(value: CalibrationInterval | null): string {
    if (!value) return 'Not enough evidence';
    if (value.high < 0) {
        return `${Math.abs(Math.round(value.midpoint)).toLocaleString()} kcal lower (${Math.abs(Math.round(value.high)).toLocaleString()} to ${Math.abs(Math.round(value.low)).toLocaleString()})`;
    }
    if (value.low > 0) {
        return `${Math.round(value.midpoint).toLocaleString()} kcal higher (${Math.round(value.low).toLocaleString()} to ${Math.round(value.high).toLocaleString()})`;
    }
    return `${Math.round(value.midpoint).toLocaleString()} kcal (${Math.round(value.low).toLocaleString()} to ${Math.round(value.high).toLocaleString()})`;
}

export function formatWeightPace(value: CalibrationInterval | null): string {
    if (!value) return 'Not enough evidence';
    const sign = value.midpoint > 0 ? '+' : '';
    return `${sign}${value.midpoint.toFixed(2)} kg/week`;
}

export function formatCalorieBudgetChange(stepKcal: number): string {
    return `${Math.abs(stepKcal)} kcal ${stepKcal < 0 ? 'lower' : 'higher'}`;
}

export function describeCalibrationEvidence(result: CalibrationResult): string {
    const quality = result.dataQuality;
    if (!result.selectedWindowDays) return 'No observation window selected yet.';
    return `${quality.confidentDays} confident food days | ${quality.weightPoints} weights across ${quality.weightSpanDays} days | ${quality.missingDays + quality.incompleteDays} uncertain days`;
}
