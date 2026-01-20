import { parseNonNegativeNumber, parsePositiveInteger, parsePositiveNumber } from '../utils/requestParsing';
import { createHttpError, normalizeMyFoodName, normalizeOptionalString, type HttpError } from './myFoodsUtils';

/**
 * Parsing helpers for recipe ingredient payloads.
 *
 * These functions produce immutable snapshot rows for "My Foods" recipes.
 */
export type ExternalIngredientSnapshotRow = {
  sort_order: number;
  source: 'EXTERNAL';
  name_snapshot: string;
  calories_total_snapshot: number;
  external_source: string | null;
  external_id: string | null;
  brand_snapshot: string | null;
  locale_snapshot: string | null;
  barcode_snapshot: string | null;
  measure_label_snapshot: string | null;
  grams_per_measure_snapshot: number | null;
  measure_quantity_snapshot: number | null;
  grams_total_snapshot: number | null;
};

export type ParseResult<T> = { ok: true; value: T } | { ok: false; error: HttpError };

/**
 * Validate and normalize a "MY_FOOD" recipe ingredient payload.
 */
export function parseMyFoodIngredientInput(
  ingredient: unknown
): ParseResult<{ myFoodId: number; quantityServings: number }> {
  const record = ingredient && typeof ingredient === 'object' ? (ingredient as Record<string, unknown>) : null;
  const myFoodId = parsePositiveInteger(record?.my_food_id);
  if (myFoodId === null) {
    return { ok: false, error: createHttpError(400, 'Invalid ingredient my_food_id') };
  }

  const quantityServings = parsePositiveNumber(record?.quantity_servings);
  if (quantityServings === null) {
    return { ok: false, error: createHttpError(400, 'Invalid ingredient quantity_servings') };
  }

  return { ok: true, value: { myFoodId, quantityServings } };
}

/**
 * Build a validated snapshot row for an "EXTERNAL" recipe ingredient payload.
 */
export function buildExternalIngredientSnapshotRow(
  ingredient: unknown,
  sortOrder: number
): ParseResult<ExternalIngredientSnapshotRow> {
  const record = ingredient && typeof ingredient === 'object' ? (ingredient as Record<string, unknown>) : null;

  const externalName = normalizeMyFoodName(record?.name);
  if (!externalName) {
    return { ok: false, error: createHttpError(400, 'Invalid external ingredient name') };
  }

  const caloriesTotal = parseNonNegativeNumber(record?.calories_total);
  if (caloriesTotal === null) {
    return { ok: false, error: createHttpError(400, 'Invalid external ingredient calories_total') };
  }

  return {
    ok: true,
    value: {
      sort_order: sortOrder,
      source: 'EXTERNAL',
      name_snapshot: externalName,
      calories_total_snapshot: caloriesTotal,
      external_source: normalizeOptionalString(record?.external_source),
      external_id: normalizeOptionalString(record?.external_id),
      brand_snapshot: normalizeOptionalString(record?.brand),
      locale_snapshot: normalizeOptionalString(record?.locale),
      barcode_snapshot: normalizeOptionalString(record?.barcode),
      measure_label_snapshot: normalizeOptionalString(record?.measure_label),
      grams_per_measure_snapshot: parsePositiveNumber(record?.grams_per_measure),
      measure_quantity_snapshot: parsePositiveNumber(record?.measure_quantity),
      grams_total_snapshot: parsePositiveNumber(record?.grams_total),
    },
  };
}
