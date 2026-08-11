/**
 * Provides Expo client behavior for height input.
 */
import {
    HEIGHT_UNITS,
    MAX_HEIGHT_MM,
    MIN_HEIGHT_MM,
    type HeightUnit
} from '@calibrate/shared';

const MILLIMETERS_PER_CENTIMETER = 10;
const MILLIMETERS_PER_INCH = 25.4;
const INCHES_PER_FOOT = 12;

/** Build height input to canonical millimeters from the supplied domain inputs. */
export function heightInputToCanonicalMillimeters(args: {
    unit: HeightUnit;
    centimeters?: number;
    feet?: number;
    inches?: number;
}): number | null {
    if (args.unit === HEIGHT_UNITS.CM) {
        if (!Number.isFinite(args.centimeters)) return null;
        return Math.round(args.centimeters! * MILLIMETERS_PER_CENTIMETER);
    }
    if (
        !Number.isInteger(args.feet) ||
        !Number.isInteger(args.inches) ||
        args.feet! < 0 ||
        args.inches! < 0 ||
        args.inches! >= INCHES_PER_FOOT
    ) {
        return null;
    }
    return Math.round(((args.feet! * INCHES_PER_FOOT) + args.inches!) * MILLIMETERS_PER_INCH);
}

/** Determine whether the input conforms to the height within policy contract. */
export function isHeightWithinPolicy(args: {
    unit: HeightUnit;
    centimeters?: number;
    feet?: number;
    inches?: number;
}): boolean {
    const millimeters = heightInputToCanonicalMillimeters(args);
    return millimeters !== null && millimeters >= MIN_HEIGHT_MM && millimeters <= MAX_HEIGHT_MM;
}

/** Resolve the height policy error from the current validated state. */
export function getHeightPolicyError(unit: HeightUnit): string {
    return unit === HEIGHT_UNITS.CM
        ? 'Enter a height from 100 to 250 cm.'
        : 'Enter a height from 3 ft 4 in to 8 ft 2 in.';
}
