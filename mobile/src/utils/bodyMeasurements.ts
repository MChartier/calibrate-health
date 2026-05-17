import { WEIGHT_UNITS, type WeightUnit } from '@calibrate/shared';

const GRAMS_PER_KG = 1000;
const GRAMS_PER_LB = 453.59237;
const MM_PER_CM = 10;
const INCHES_PER_FOOT = 12;
const CM_PER_INCH = 2.54;

export function gramsToDisplayWeight(grams: number | null, unit: WeightUnit): string {
    if (!grams) return '';
    const value = unit === WEIGHT_UNITS.LB ? grams / GRAMS_PER_LB : grams / GRAMS_PER_KG;
    return value.toFixed(1);
}

export function millimetersToCentimeters(mm: number | null | undefined): string {
    return mm ? (mm / MM_PER_CM).toFixed(1) : '';
}

export function millimetersToFeetInches(mm: number | null | undefined): { feet: string; inches: string } {
    if (!mm) return { feet: '', inches: '' };
    const totalInches = Math.round((mm / MM_PER_CM) / CM_PER_INCH);
    return {
        feet: String(Math.floor(totalInches / INCHES_PER_FOOT)),
        inches: String(totalInches % INCHES_PER_FOOT)
    };
}
