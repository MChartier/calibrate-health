import express from 'express';
import multer from 'multer';
import type { Prisma } from '@prisma/client';
import prisma from '../config/database';
import { parseWeightToGrams, isWeightUnit, type WeightUnit } from '../utils/units';
import { parseLocalDateOnly } from '../utils/date';
import {
  buildImportTimestamp,
  inferLoseItWeightUnit,
  parseLoseItExport,
  type LoseItFoodLogImport,
  type LoseItWeightImport,
} from '../services/loseItImport';

const router = express.Router();

const MAX_LOSE_IT_ZIP_BYTES = 25 * 1024 * 1024; // Protects memory usage for zip parsing.
const FOOD_INSERT_BATCH_SIZE = 250; // Keeps createMany payloads small for Prisma + Postgres.
const FOOD_DELETE_BATCH_SIZE = 200; // Keeps deleteMany IN lists manageable.
const WEIGHT_UPSERT_BATCH_SIZE = 50; // Throttle upsert batches to avoid overloading the DB.

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_LOSE_IT_ZIP_BYTES },
});

type FoodConflictMode = 'MERGE' | 'REPLACE' | 'SKIP';
type WeightConflictMode = 'KEEP' | 'OVERWRITE';

type LoseItImportOptions = {
  weightUnit: WeightUnit;
  foodConflictMode: FoodConflictMode;
  weightConflictMode: WeightConflictMode;
  includeBodyFat: boolean;
};

const isAuthenticated = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ message: 'Not authenticated' });
};

router.use(isAuthenticated);

router.post('/loseit/preview', upload.single('file'), async (req, res) => {
  const user = req.user as any;
  if (!req.file) {
    return res.status(400).json({ message: 'Missing export zip' });
  }

  let parsed;
  try {
    parsed = parseLoseItExport(req.file.buffer);
  } catch (err) {
    return res.status(400).json({ message: 'Unable to read that export zip.' });
  }

  const fallbackUnit = isWeightUnit(user?.weight_unit) ? user.weight_unit : 'KG';
  const unitGuess = inferLoseItWeightUnit(parsed.profile, fallbackUnit);

  const foodDates = new Set(parsed.foodLogs.map((log) => log.localDate));
  const weightDates = new Set(parsed.weights.map((weight) => weight.localDate));
  const { startDate, endDate } = computeDateRange([...foodDates, ...weightDates]);

  const existingFoodDays = foodDates.size > 0 ? await countExistingFoodDays(user.id, foodDates) : 0;
  const existingWeightDays = weightDates.size > 0 ? await countExistingWeightDays(user.id, weightDates) : 0;

  res.json({
    summary: {
      foodLogs: parsed.foodLogs.length,
      foodLogDays: foodDates.size,
      weights: parsed.weights.length,
      bodyFat: parsed.bodyFat.length,
      startDate,
      endDate,
    },
    conflicts: {
      foodLogDays: existingFoodDays,
      weightDays: existingWeightDays,
    },
    warnings: parsed.warnings,
    weightUnitGuess: unitGuess.unit,
    weightUnitGuessSource: unitGuess.source,
  });
});

router.post('/loseit/execute', upload.single('file'), async (req, res) => {
  const user = req.user as any;
  if (!req.file) {
    return res.status(400).json({ message: 'Missing export zip' });
  }

  const options = parseImportOptions(req.body);
  if (!options.ok) {
    return res.status(400).json({ message: options.message });
  }

  let parsed;
  try {
    parsed = parseLoseItExport(req.file.buffer);
  } catch (err) {
    return res.status(400).json({ message: 'Unable to read that export zip.' });
  }

  const bodyFatByDate = new Map(parsed.bodyFat.map((entry) => [entry.localDate, entry.value]));

  let importedFoodLogs = 0;
  let skippedFoodLogs = 0;
  let importedWeights = 0;
  let updatedWeights = 0;
  let skippedWeights = 0;
  let updatedBodyFat = 0;

  const foodLogsToInsert = await resolveFoodLogsToInsert({
    userId: user.id,
    imports: parsed.foodLogs,
    conflictMode: options.value.foodConflictMode,
  });

  for (const batch of chunkArray(foodLogsToInsert.rows, FOOD_INSERT_BATCH_SIZE)) {
    if (batch.length === 0) continue;
    await prisma.foodLog.createMany({ data: batch });
  }

  importedFoodLogs = foodLogsToInsert.rows.length;
  skippedFoodLogs = foodLogsToInsert.skippedCount;

  const weightResult = await applyWeightImports({
    userId: user.id,
    imports: parsed.weights,
    bodyFatByDate,
    weightUnit: options.value.weightUnit,
    conflictMode: options.value.weightConflictMode,
    includeBodyFat: options.value.includeBodyFat,
  });

  importedWeights = weightResult.imported;
  updatedWeights = weightResult.updated;
  skippedWeights = weightResult.skipped;
  updatedBodyFat = weightResult.bodyFatUpdated;

  res.json({
    importedFoodLogs,
    skippedFoodLogs,
    importedWeights,
    updatedWeights,
    skippedWeights,
    updatedBodyFat,
    warnings: parsed.warnings,
  });
});

export default router;

/**
 * Validate and normalize the import options payload from a multipart form.
 */
function parseImportOptions(body: Record<string, unknown> | undefined):
  | { ok: true; value: LoseItImportOptions }
  | { ok: false; message: string } {
  const weightUnit = body?.weight_unit;
  if (!isWeightUnit(weightUnit)) {
    return { ok: false, message: 'Invalid weight unit' };
  }

  const foodConflictMode = body?.food_conflict_mode;
  if (foodConflictMode !== 'MERGE' && foodConflictMode !== 'REPLACE' && foodConflictMode !== 'SKIP') {
    return { ok: false, message: 'Invalid food conflict mode' };
  }

  const weightConflictMode = body?.weight_conflict_mode;
  if (weightConflictMode !== 'KEEP' && weightConflictMode !== 'OVERWRITE') {
    return { ok: false, message: 'Invalid weight conflict mode' };
  }

  const includeBodyFatRaw = body?.include_body_fat;
  const includeBodyFat =
    includeBodyFatRaw === true ||
    includeBodyFatRaw === 'true' ||
    includeBodyFatRaw === '1' ||
    includeBodyFatRaw === 1;

  return {
    ok: true,
    value: {
      weightUnit,
      foodConflictMode,
      weightConflictMode,
      includeBodyFat,
    },
  };
}

/**
 * Count how many imported food days already have logs for the user.
 */
async function countExistingFoodDays(userId: number, importDates: Set<string>): Promise<number> {
  const { minDate, maxDate } = computeDateRangeAsDates(importDates);
  if (!minDate || !maxDate) return 0;

  const existing = await prisma.foodLog.findMany({
    where: {
      user_id: userId,
      local_date: { gte: minDate, lte: maxDate },
    },
    select: { local_date: true },
  });

  const existingDates = new Set(existing.map((row) => formatUtcDateKey(row.local_date)));
  let count = 0;
  for (const date of importDates) {
    if (existingDates.has(date)) count += 1;
  }
  return count;
}

/**
 * Count how many imported weight days already have metrics for the user.
 */
async function countExistingWeightDays(userId: number, importDates: Set<string>): Promise<number> {
  const { minDate, maxDate } = computeDateRangeAsDates(importDates);
  if (!minDate || !maxDate) return 0;

  const existing = await prisma.bodyMetric.findMany({
    where: {
      user_id: userId,
      date: { gte: minDate, lte: maxDate },
    },
    select: { date: true },
  });

  const existingDates = new Set(existing.map((row) => formatUtcDateKey(row.date)));
  let count = 0;
  for (const date of importDates) {
    if (existingDates.has(date)) count += 1;
  }
  return count;
}

/**
 * Apply conflict rules and return only the food log rows we should insert.
 */
async function resolveFoodLogsToInsert(opts: {
  userId: number;
  imports: LoseItFoodLogImport[];
  conflictMode: FoodConflictMode;
}): Promise<{ rows: Prisma.FoodLogCreateManyInput[]; skippedCount: number }> {
  if (opts.imports.length === 0) {
    return { rows: [], skippedCount: 0 };
  }

  const dateMap = new Map<string, Date>();
  for (const entry of opts.imports) {
    dateMap.set(entry.localDate, entry.localDateValue);
  }

  if (opts.conflictMode === 'REPLACE') {
    for (const batch of chunkArray(Array.from(dateMap.values()), FOOD_DELETE_BATCH_SIZE)) {
      await prisma.foodLog.deleteMany({
        where: { user_id: opts.userId, local_date: { in: batch } },
      });
    }
  }

  const existingByDate = await buildExistingFoodFingerprintMap({
    userId: opts.userId,
    dateValues: Array.from(dateMap.values()),
    includeFingerprints: opts.conflictMode === 'MERGE',
  });

  const rows: Prisma.FoodLogCreateManyInput[] = [];
  let skippedCount = 0;

  for (const entry of opts.imports) {
    const dateKey = entry.localDate;

    if (opts.conflictMode === 'SKIP' && existingByDate.has(dateKey)) {
      skippedCount += 1;
      continue;
    }

    if (opts.conflictMode === 'MERGE') {
      const fingerprint = buildFoodFingerprint(entry);
      const existingSet = existingByDate.get(dateKey) ?? new Set<string>();
      if (existingSet.has(fingerprint)) {
        skippedCount += 1;
        continue;
      }
      existingSet.add(fingerprint);
      existingByDate.set(dateKey, existingSet);
    }

    rows.push({
      user_id: opts.userId,
      name: entry.name,
      calories: entry.calories,
      meal_period: entry.mealPeriod,
      date: entry.entryTimestamp,
      local_date: entry.localDateValue,
      servings_consumed: entry.servingsConsumed ?? null,
      serving_size_quantity_snapshot: entry.servingSizeQuantity ?? null,
      serving_unit_label_snapshot: entry.servingUnitLabel ?? null,
      calories_per_serving_snapshot: entry.caloriesPerServing ?? null,
    });
  }

  return { rows, skippedCount };
}

/**
 * Build a map of existing food log fingerprints per day to support merge/dedupe.
 */
async function buildExistingFoodFingerprintMap(opts: {
  userId: number;
  dateValues: Date[];
  includeFingerprints: boolean;
}): Promise<Map<string, Set<string>>> {
  const result = new Map<string, Set<string>>();
  if (opts.dateValues.length === 0) return result;

  const minDate = opts.dateValues.reduce((min, value) => (value < min ? value : min));
  const maxDate = opts.dateValues.reduce((max, value) => (value > max ? value : max));

  const existing = await prisma.foodLog.findMany({
    where: {
      user_id: opts.userId,
      local_date: { gte: minDate, lte: maxDate },
    },
    select: {
      local_date: true,
      meal_period: true,
      name: true,
      calories: true,
      servings_consumed: true,
      serving_unit_label_snapshot: true,
    },
  });

  for (const row of existing) {
    const dateKey = formatUtcDateKey(row.local_date);
    const set = result.get(dateKey) ?? new Set<string>();
    if (opts.includeFingerprints) {
      const fingerprint = buildFoodFingerprint({
        localDate: dateKey,
        localDateValue: row.local_date,
        entryTimestamp: buildImportTimestamp(row.local_date),
        mealPeriod: row.meal_period,
        name: row.name,
        calories: row.calories,
        servingsConsumed: row.servings_consumed ?? null,
        servingUnitLabel: row.serving_unit_label_snapshot ?? null,
        servingSizeQuantity: null,
        caloriesPerServing: null,
      });
      set.add(fingerprint);
    }
    result.set(dateKey, set);
  }

  return result;
}

/**
 * Derive a stable fingerprint for deduping food log entries.
 */
function buildFoodFingerprint(entry: LoseItFoodLogImport): string {
  const normalizedName = entry.name.trim().toLowerCase();
  const servingsKey = entry.servingsConsumed !== null ? roundForFingerprint(entry.servingsConsumed) : '';
  const unitKey = entry.servingUnitLabel ? entry.servingUnitLabel.trim().toLowerCase() : '';
  return `${entry.localDate}|${entry.mealPeriod}|${normalizedName}|${entry.calories}|${servingsKey}|${unitKey}`;
}

/**
 * Import weight entries using the requested conflict behavior.
 */
async function applyWeightImports(opts: {
  userId: number;
  imports: LoseItWeightImport[];
  bodyFatByDate: Map<string, number>;
  weightUnit: WeightUnit;
  conflictMode: WeightConflictMode;
  includeBodyFat: boolean;
}): Promise<{ imported: number; updated: number; skipped: number; bodyFatUpdated: number }> {
  if (opts.imports.length === 0) {
    return { imported: 0, updated: 0, skipped: 0, bodyFatUpdated: 0 };
  }

  const dateValues = opts.imports.map((entry) => entry.localDateValue);
  const minDate = dateValues.reduce((min, value) => (value < min ? value : min));
  const maxDate = dateValues.reduce((max, value) => (value > max ? value : max));

  const existing = await prisma.bodyMetric.findMany({
    where: { user_id: opts.userId, date: { gte: minDate, lte: maxDate } },
    select: { id: true, date: true, body_fat_percent: true },
  });

  const existingByDate = new Map<string, { id: number; bodyFat: number | null }>();
  for (const row of existing) {
    existingByDate.set(formatUtcDateKey(row.date), { id: row.id, bodyFat: row.body_fat_percent });
  }

  let imported = 0;
  let updated = 0;
  let skipped = 0;
  let bodyFatUpdated = 0;

  if (opts.conflictMode === 'KEEP') {
    const createRows = [];
    for (const entry of opts.imports) {
      const dateKey = entry.localDate;
      if (existingByDate.has(dateKey)) {
        skipped += 1;
        continue;
      }

      const bodyFatValue = opts.includeBodyFat ? opts.bodyFatByDate.get(dateKey) ?? null : null;
      if (bodyFatValue !== null) {
        bodyFatUpdated += 1;
      }
      createRows.push({
        user_id: opts.userId,
        date: entry.localDateValue,
        weight_grams: parseWeightToGrams(entry.weightValue, opts.weightUnit),
        body_fat_percent: bodyFatValue,
      });
    }

    if (createRows.length > 0) {
      await prisma.bodyMetric.createMany({ data: createRows });
      imported = createRows.length;
    }

    if (opts.includeBodyFat) {
      for (const entry of opts.imports) {
        const bodyFatValue = opts.bodyFatByDate.get(entry.localDate);
        if (bodyFatValue === undefined) continue;

        const existingMetric = existingByDate.get(entry.localDate);
        if (!existingMetric || existingMetric.bodyFat !== null) continue;

        await prisma.bodyMetric.update({
          where: { id: existingMetric.id },
          data: { body_fat_percent: bodyFatValue },
        });
        bodyFatUpdated += 1;
      }
    }

    return { imported, updated, skipped, bodyFatUpdated };
  }

  const upserts = opts.imports.map((entry) => {
    const bodyFatValue = opts.includeBodyFat ? opts.bodyFatByDate.get(entry.localDate) : undefined;
    const updateData: { weight_grams: number; body_fat_percent?: number } = {
      weight_grams: parseWeightToGrams(entry.weightValue, opts.weightUnit),
    };
    if (bodyFatValue !== undefined) {
      updateData.body_fat_percent = bodyFatValue;
    }

    const createData = {
      user_id: opts.userId,
      date: entry.localDateValue,
      weight_grams: updateData.weight_grams,
      body_fat_percent: bodyFatValue ?? null,
    };

    return prisma.bodyMetric.upsert({
      where: { user_id_date: { user_id: opts.userId, date: entry.localDateValue } },
      update: updateData,
      create: createData,
    });
  });

  for (const batch of chunkArray(upserts, WEIGHT_UPSERT_BATCH_SIZE)) {
    await prisma.$transaction(batch);
  }

  for (const entry of opts.imports) {
    if (existingByDate.has(entry.localDate)) {
      updated += 1;
    } else {
      imported += 1;
    }
  }

  if (opts.includeBodyFat) {
    for (const entry of opts.imports) {
      if (opts.bodyFatByDate.has(entry.localDate)) {
        bodyFatUpdated += 1;
      }
    }
  }

  return { imported, updated, skipped, bodyFatUpdated };
}

/**
 * Compute the min/max date from an array of date strings.
 */
function computeDateRange(dates: string[]): { startDate: string | null; endDate: string | null } {
  if (dates.length === 0) return { startDate: null, endDate: null };
  let startDate = dates[0];
  let endDate = dates[0];
  for (const date of dates) {
    if (date < startDate) startDate = date;
    if (date > endDate) endDate = date;
  }
  return { startDate, endDate };
}

/**
 * Convert date strings to Date values and compute the min/max range.
 */
function computeDateRangeAsDates(dates: Set<string>): { minDate: Date | null; maxDate: Date | null } {
  if (dates.size === 0) return { minDate: null, maxDate: null };
  const values = Array.from(dates).map((date) => parseLocalDateOnly(date));
  const minDate = values.reduce((min, value) => (value < min ? value : min));
  const maxDate = values.reduce((max, value) => (value > max ? value : max));
  return { minDate, maxDate };
}

/**
 * Format a UTC-normalized Date into a YYYY-MM-DD key string.
 */
function formatUtcDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/**
 * Round numeric values to limit noise in dedupe fingerprints.
 */
function roundForFingerprint(value: number): string {
  return String(Math.round(value * 1000) / 1000);
}

/**
 * Chunk an array into fixed-size batches.
 */
function chunkArray<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let idx = 0; idx < items.length; idx += size) {
    result.push(items.slice(idx, idx + size));
  }
  return result;
}
