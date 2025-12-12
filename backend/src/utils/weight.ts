export type WeightUnit = 'KG' | 'LB';

const LB_TO_GRAMS = 453.59237;

export function isWeightUnit(value: unknown): value is WeightUnit {
  return value === 'KG' || value === 'LB';
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

