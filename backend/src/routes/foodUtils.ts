import type { MealPeriod } from '@prisma/client';
import { getSafeUtcTodayDateOnlyInTimeZone, parseLocalDateOnly } from '../utils/date';
import { parseMealPeriod } from '../utils/mealPeriod';
import {
  parseNonNegativeNumber,
  parsePositiveInteger,
  parsePositiveNumber,
  resolveLanguageCode,
} from '../utils/requestParsing';

/**
 * Parsing/validation helpers for food search and food log endpoints.
 *
 * These stay Prisma-free so they can be unit tested without database setup.
 */
export type FoodSearchParams = {
  query: string | undefined;
  barcode: string | undefined;
  page: number | undefined;
  pageSize: number | undefined;
  quantityInGrams: number | undefined;
  languageCode: string | undefined;
};

export type FoodSearchParamsParseResult =
  | { ok: true; params: FoodSearchParams }
  | { ok: false; statusCode: number; message: string };

/**
 * Parse and validate `/api/food/search` query params.
 *
 * Returns a friendly 400 when neither query nor barcode are present.
 */
export function parseFoodSearchParams(opts: {
  query: Record<string, unknown>;
  acceptLanguageHeader: unknown;
}): FoodSearchParamsParseResult {
  const queryParam =
    typeof opts.query.q === 'string'
      ? opts.query.q
      : typeof opts.query.query === 'string'
        ? opts.query.query
        : undefined;
  const barcode = typeof opts.query.barcode === 'string' ? opts.query.barcode : undefined;

  if (!queryParam && !barcode) {
    return { ok: false, statusCode: 400, message: 'Provide a search query or barcode.' };
  }

  const pageRaw = typeof opts.query.page === 'string' ? Number.parseInt(opts.query.page, 10) : undefined;
  const page = typeof pageRaw === 'number' && Number.isFinite(pageRaw) ? pageRaw : undefined;

  const pageSizeRaw = typeof opts.query.pageSize === 'string' ? Number.parseInt(opts.query.pageSize, 10) : undefined;
  const pageSize = typeof pageSizeRaw === 'number' && Number.isFinite(pageSizeRaw) ? pageSizeRaw : undefined;

  const gramsRaw = typeof opts.query.grams === 'string' ? Number.parseFloat(opts.query.grams) : undefined;
  const quantityInGrams = typeof gramsRaw === 'number' && Number.isFinite(gramsRaw) ? gramsRaw : undefined;

  const languageCode = resolveLanguageCode({
    queryLanguageCode: opts.query.lc,
    acceptLanguageHeader: opts.acceptLanguageHeader,
  });

  return {
    ok: true,
    params: {
      query: queryParam || undefined,
      barcode,
      page,
      pageSize,
      quantityInGrams,
      languageCode,
    },
  };
}

export type FoodLogCreateParseResult =
  | {
      ok: true;
      kind: 'MY_FOOD';
      mealPeriod: MealPeriod;
      localDate: Date;
      entryTimestamp: Date;
      myFoodId: number;
      servingsConsumed: number;
    }
  | {
      ok: true;
      kind: 'MANUAL';
      mealPeriod: MealPeriod;
      localDate: Date;
      entryTimestamp: Date;
      name: string;
      calories: number;
    }
  | { ok: false; statusCode: number; message: string };

/**
 * Parse and validate a create-food-log request body.
 *
 * This is Prisma-free by design; it only validates user inputs and computes date defaults.
 */
export function parseFoodLogCreateBody(opts: {
  body: unknown;
  userTimeZone: unknown;
  now?: Date;
}): FoodLogCreateParseResult {
  if (!opts.body || typeof opts.body !== 'object') {
    return { ok: false, statusCode: 400, message: 'Invalid request body' };
  }

  const body = opts.body as Record<string, unknown>;
  const now = opts.now ?? new Date();

  const parsedMealPeriod = parseMealPeriod(body.meal_period);
  if (!parsedMealPeriod) {
    return { ok: false, statusCode: 400, message: 'Invalid meal period' };
  }

  const rawDate = body.date;

  let localDate: Date;
  if (rawDate === undefined || rawDate === null || (typeof rawDate === 'string' && rawDate.trim().length === 0)) {
    localDate = getSafeUtcTodayDateOnlyInTimeZone(opts.userTimeZone, now);
  } else {
    try {
      localDate = parseLocalDateOnly(rawDate);
    } catch {
      return { ok: false, statusCode: 400, message: 'Invalid date' };
    }
  }

  const entryTimestamp = rawDate ? new Date(rawDate as any) : now;
  if (Number.isNaN(entryTimestamp.getTime())) {
    return { ok: false, statusCode: 400, message: 'Invalid date' };
  }

  const wantsMyFood =
    body.my_food_id !== undefined && body.my_food_id !== null && String(body.my_food_id).trim().length > 0;
  const wantsManual = body.name !== undefined || body.calories !== undefined;
  if (wantsMyFood && wantsManual) {
    return {
      ok: false,
      statusCode: 400,
      message: 'Provide either my_food_id+servings_consumed or name+calories, not both.',
    };
  }

  if (wantsMyFood) {
    const myFoodId = parsePositiveInteger(body.my_food_id);
    if (myFoodId === null) {
      return { ok: false, statusCode: 400, message: 'Invalid my food id' };
    }

    const servingsConsumed = parsePositiveNumber(body.servings_consumed);
    if (servingsConsumed === null) {
      return { ok: false, statusCode: 400, message: 'Invalid servings consumed' };
    }

    return {
      ok: true,
      kind: 'MY_FOOD',
      mealPeriod: parsedMealPeriod,
      localDate,
      entryTimestamp,
      myFoodId,
      servingsConsumed,
    };
  }

  const trimmedName = typeof body.name === 'string' ? body.name.trim() : '';
  if (!trimmedName) {
    return { ok: false, statusCode: 400, message: 'Invalid name' };
  }

  const caloriesNumber = parseNonNegativeNumber(body.calories);
  if (caloriesNumber === null) {
    return { ok: false, statusCode: 400, message: 'Invalid calories' };
  }

  return {
    ok: true,
    kind: 'MANUAL',
    mealPeriod: parsedMealPeriod,
    localDate,
    entryTimestamp,
    name: trimmedName,
    calories: Math.round(caloriesNumber),
  };
}

export type FoodLogUpdateData = Partial<{
  name: string;
  calories: number;
  meal_period: MealPeriod;
  servings_consumed: number | null;
  calories_per_serving_snapshot: number | null;
}>;

export type FoodLogUpdateParseResult =
  | { ok: true; updateData: FoodLogUpdateData }
  | { ok: false; statusCode: number; message: string };

/**
 * Parse and validate a PATCH-food-log request body.
 */
export function parseFoodLogUpdateBody(opts: {
  body: unknown;
  existing: { calories_per_serving_snapshot?: number | null; servings_consumed?: number | null };
}): FoodLogUpdateParseResult {
  if (!opts.body || typeof opts.body !== 'object') {
    return { ok: false, statusCode: 400, message: 'Invalid request body' };
  }

  const body = opts.body as Record<string, unknown>;

  const updateData: FoodLogUpdateData = {};

  if (body.name !== undefined) {
    if (typeof body.name !== 'string' || !body.name.trim()) {
      return { ok: false, statusCode: 400, message: 'Invalid name' };
    }
    updateData.name = body.name.trim();
  }

  if (body.calories !== undefined) {
    const parsedCalories = parseNonNegativeNumber(body.calories);
    if (parsedCalories === null) {
      return { ok: false, statusCode: 400, message: 'Invalid calories' };
    }
    updateData.calories = Math.round(parsedCalories);
  }

  if (body.meal_period !== undefined) {
    const parsedMealPeriod = parseMealPeriod(body.meal_period);
    if (!parsedMealPeriod) {
      return { ok: false, statusCode: 400, message: 'Invalid meal period' };
    }
    updateData.meal_period = parsedMealPeriod;
  }

  if (body.servings_consumed !== undefined) {
    const parsedServings = parsePositiveNumber(body.servings_consumed);
    if (parsedServings === null) {
      return { ok: false, statusCode: 400, message: 'Invalid servings consumed' };
    }

    if (opts.existing.calories_per_serving_snapshot === null || opts.existing.calories_per_serving_snapshot === undefined) {
      return { ok: false, statusCode: 400, message: 'This entry does not include serving info.' };
    }

    updateData.servings_consumed = parsedServings;

    if (updateData.calories === undefined) {
      updateData.calories = Math.round(parsedServings * opts.existing.calories_per_serving_snapshot);
    }
  }

  if (updateData.calories !== undefined) {
    const servings =
      updateData.servings_consumed ??
      (opts.existing.servings_consumed !== null && opts.existing.servings_consumed !== undefined
        ? opts.existing.servings_consumed
        : null);

    if (servings && servings > 0) {
      updateData.calories_per_serving_snapshot = updateData.calories / servings;
    }
  }

  if (Object.keys(updateData).length === 0) {
    return { ok: false, statusCode: 400, message: 'No fields to update' };
  }

  return { ok: true, updateData };
}
