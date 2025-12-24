export type WeightUnit = 'KG' | 'LB';
export type UnitSystem = 'METRIC' | 'IMPERIAL';

const LB_TO_GRAMS = 453.59237;

export function isWeightUnit(value: unknown): value is WeightUnit {
  return value === 'KG' || value === 'LB';
}

export function isUnitSystem(value: unknown): value is UnitSystem {
  return value === 'METRIC' || value === 'IMPERIAL';
}

export function unitSystemToWeightUnit(system: UnitSystem): WeightUnit {
  return system === 'IMPERIAL' ? 'LB' : 'KG';
}

/**
 * Resolve the effective weight unit from stored preferences, favoring an explicit weight_unit and
 * falling back to a unit_system default.
 */
export function resolveWeightUnit(preferences: {
  weight_unit?: WeightUnit | null;
  unit_system?: UnitSystem | null;
}): WeightUnit {
  if (isWeightUnit(preferences.weight_unit)) {
    return preferences.weight_unit;
  }
  if (isUnitSystem(preferences.unit_system)) {
    return unitSystemToWeightUnit(preferences.unit_system);
  }
  return 'KG';
}

export function parseWeightToGrams(input: unknown, unit: WeightUnit): number {
  const numeric =
    typeof input === 'number' ? input : typeof input === 'string' ? Number(input) : Number.NaN;

  if (!Number.isFinite(numeric)) {
    throw new Error('Invalid weight');
  }

  const roundedToTenth = Math.round(numeric * 10) / 10;
  if (roundedToTenth <= 0) {
    throw new Error('Weight must be positive');
  }

  const grams = unit === 'KG' ? roundedToTenth * 1000 : roundedToTenth * LB_TO_GRAMS;
  return Math.round(grams);
}

export function gramsToWeight(grams: number, unit: WeightUnit): number {
  if (!Number.isFinite(grams)) {
    throw new Error('Invalid weight');
  }

  const weight = unit === 'KG' ? grams / 1000 : grams / LB_TO_GRAMS;
  return Math.round(weight * 10) / 10;
}

