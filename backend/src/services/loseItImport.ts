import path from 'node:path';
import AdmZip from 'adm-zip';
import { MealPeriod, type WeightUnit } from '@prisma/client';
import { parseLocalDateOnly } from '../utils/date';

const MAX_WARNING_COUNT = 20; // Cap warning output to keep responses readable.
const IMPORT_ENTRY_HOUR_UTC = 12; // Midday UTC keeps date-only entries stable across time zones.

const LOSE_IT_DATE_PATTERN = /^(?<month>\d{1,2})\/(?<day>\d{1,2})\/(?<year>\d{4})$/;

const LOSE_IT_MEAL_MAP: Record<string, MealPeriod> = {
  breakfast: 'BREAKFAST',
  'morning snack': 'MORNING_SNACK',
  'morning snacks': 'MORNING_SNACK',
  lunch: 'LUNCH',
  'afternoon snack': 'AFTERNOON_SNACK',
  'afternoon snacks': 'AFTERNOON_SNACK',
  dinner: 'DINNER',
  'evening snack': 'EVENING_SNACK',
  'evening snacks': 'EVENING_SNACK',
};

export type LoseItFoodLogImport = {
  localDate: string;
  localDateValue: Date;
  entryTimestamp: Date;
  mealPeriod: MealPeriod;
  name: string;
  calories: number;
  servingsConsumed: number | null;
  servingSizeQuantity: number | null;
  servingUnitLabel: string | null;
  caloriesPerServing: number | null;
};

export type LoseItWeightImport = {
  localDate: string;
  localDateValue: Date;
  weightValue: number;
  lastUpdated: Date | null;
};

export type LoseItBodyFatImport = {
  localDate: string;
  value: number;
};

export type WeightUnitGuess = {
  unit: WeightUnit;
  source: 'profile' | 'heuristic' | 'fallback';
};

export type LoseItExportParseResult = {
  foodLogs: LoseItFoodLogImport[];
  weights: LoseItWeightImport[];
  bodyFat: LoseItBodyFatImport[];
  profile: Record<string, string>;
  warnings: string[];
};

/**
 * Parse a Lose It export zip buffer into structured rows for import.
 */
export function parseLoseItExport(zipBuffer: Buffer): LoseItExportParseResult {
  const warnings: string[] = [];
  const zip = new AdmZip(zipBuffer);
  const entries = zip.getEntries();

  const foodCsv = findZipEntryText(entries, 'food-logs.csv');
  const weightCsv = findZipEntryText(entries, 'weights.csv');
  const bodyFatCsv = findZipEntryText(entries, 'body-fat.csv');
  const profileCsv = findZipEntryText(entries, 'profile.csv');

  if (!foodCsv && !weightCsv) {
    throw new Error('Export is missing food-logs.csv and weights.csv.');
  }

  const foodLogs = foodCsv ? parseFoodLogs(foodCsv, warnings) : [];
  const weights = weightCsv ? parseWeights(weightCsv, warnings) : [];
  const bodyFat = bodyFatCsv ? parseBodyFat(bodyFatCsv, warnings) : [];
  const profile = profileCsv ? parseProfile(profileCsv) : {};

  return { foodLogs, weights, bodyFat, profile, warnings };
}

/**
 * Guess the Lose It export weight unit using profile fields, with a safe fallback.
 */
export function inferLoseItWeightUnit(profile: Record<string, string>, fallback: WeightUnit): WeightUnitGuess {
  const plan = profile.Plan ?? profile['Plan'];
  const planLower = typeof plan === 'string' ? plan.toLowerCase() : '';
  if (planLower.includes('kg')) {
    return { unit: 'KG', source: 'profile' };
  }
  if (planLower.includes('lb')) {
    return { unit: 'LB', source: 'profile' };
  }

  const heightRaw = profile.Height ?? profile['Height'];
  const heightValue = parseMaybeNumber(heightRaw);
  if (heightValue !== null) {
    // Height above 100 strongly suggests centimeters, otherwise inches.
    if (heightValue >= 100) {
      return { unit: 'KG', source: 'heuristic' };
    }
    if (heightValue > 0) {
      return { unit: 'LB', source: 'heuristic' };
    }
  }

  return { unit: fallback, source: 'fallback' };
}

/**
 * Convert a date-only string into a stable UTC timestamp used for imported log entries.
 */
export function buildImportTimestamp(localDateValue: Date): Date {
  const timestamp = new Date(localDateValue);
  timestamp.setUTCHours(IMPORT_ENTRY_HOUR_UTC, 0, 0, 0);
  return timestamp;
}

function findZipEntryText(entries: AdmZip.IZipEntry[], filename: string): string | null {
  const target = filename.toLowerCase();
  const entry = entries.find((candidate) => path.posix.basename(candidate.entryName).toLowerCase() === target);
  if (!entry) return null;
  return entry.getData().toString('utf8');
}

function parseFoodLogs(csv: string, warnings: string[]): LoseItFoodLogImport[] {
  const rows = parseCsvRows(csv, warnings);
  const results: LoseItFoodLogImport[] = [];

  for (const row of rows) {
    if (parseLoseItDeleted(row['Deleted'])) continue;

    const localDate = parseLoseItDate(row['Date'], warnings);
    if (!localDate) continue;

    const mealRaw = row['Meal'];
    const mealPeriod = parseMealPeriod(mealRaw, warnings);
    if (!mealPeriod) continue;

    const name = typeof row['Name'] === 'string' ? row['Name'].trim() : '';
    if (!name) {
      addWarning(warnings, 'Skipped a food log row with a blank name.');
      continue;
    }

    const caloriesRaw = parseMaybeNumber(row['Calories']);
    if (caloriesRaw === null || caloriesRaw < 0) {
      addWarning(warnings, `Skipped "${name}" on ${localDate} because calories are missing.`);
      continue;
    }

    const quantityRaw = parseMaybeNumber(row['Quantity']);
    const servingsConsumed = quantityRaw && quantityRaw > 0 ? quantityRaw : null;

    const unitsRaw = typeof row['Units'] === 'string' ? row['Units'].trim() : '';
    const servingUnitLabel = unitsRaw ? unitsRaw : null;
    const servingSizeQuantity = servingUnitLabel ? 1 : null;
    const caloriesPerServing =
      servingsConsumed && servingsConsumed > 0 ? Math.round((caloriesRaw / servingsConsumed) * 100) / 100 : null;

    const localDateValue = parseLocalDateValue(localDate, warnings);
    if (!localDateValue) {
      continue;
    }
    const entryTimestamp = buildImportTimestamp(localDateValue);

    results.push({
      localDate,
      localDateValue,
      entryTimestamp,
      mealPeriod,
      name,
      calories: Math.round(caloriesRaw),
      servingsConsumed,
      servingSizeQuantity,
      servingUnitLabel,
      caloriesPerServing,
    });
  }

  return results;
}

function parseWeights(csv: string, warnings: string[]): LoseItWeightImport[] {
  const rows = parseCsvRows(csv, warnings);
  const weightMap = new Map<string, LoseItWeightImport>();

  for (const row of rows) {
    if (parseLoseItDeleted(row['Deleted'])) continue;

    const localDate = parseLoseItDate(row['Date'], warnings);
    if (!localDate) continue;

    const weightValue = parseMaybeNumber(row['Weight']);
    if (weightValue === null || weightValue <= 0) {
      addWarning(warnings, `Skipped a weight entry on ${localDate} because the value is invalid.`);
      continue;
    }

    const lastUpdated = parseLoseItTimestamp(row['Last Updated']);
    const localDateValue = parseLocalDateValue(localDate, warnings);
    if (!localDateValue) {
      continue;
    }

    const existing = weightMap.get(localDate);
    if (existing && existing.lastUpdated && lastUpdated && existing.lastUpdated >= lastUpdated) {
      continue;
    }

    weightMap.set(localDate, {
      localDate,
      localDateValue,
      weightValue,
      lastUpdated,
    });
  }

  return Array.from(weightMap.values());
}

function parseBodyFat(csv: string, warnings: string[]): LoseItBodyFatImport[] {
  const rows = parseCsvRows(csv, warnings);
  const bodyFatMap = new Map<string, LoseItBodyFatImport>();

  for (const row of rows) {
    const localDate = parseLoseItDate(row['Date'], warnings);
    if (!localDate) continue;

    const value = parseMaybeNumber(row['Value']);
    if (value === null || value <= 0) continue;

    bodyFatMap.set(localDate, { localDate, value });
  }

  return Array.from(bodyFatMap.values());
}

function parseProfile(csv: string): Record<string, string> {
  const rows = parseCsvRows(csv, []);
  const profile: Record<string, string> = {};
  for (const row of rows) {
    const name = typeof row['Name'] === 'string' ? row['Name'].trim() : '';
    const value = typeof row['Value'] === 'string' ? row['Value'].trim() : '';
    if (name) {
      profile[name] = value;
    }
  }
  return profile;
}

function parseMealPeriod(raw: string | undefined, warnings: string[]): MealPeriod | null {
  if (!raw) return null;
  const normalized = raw.trim().toLowerCase();
  const mapped = LOSE_IT_MEAL_MAP[normalized];
  if (!mapped) {
    addWarning(warnings, `Skipped a food log row with unknown meal "${raw}".`);
    return null;
  }
  return mapped;
}

function parseLoseItDate(raw: string | undefined, warnings: string[]): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const match = trimmed.match(LOSE_IT_DATE_PATTERN);
  if (!match?.groups) {
    addWarning(warnings, `Skipped a row with an invalid date "${raw}".`);
    return null;
  }

  const month = match.groups.month.padStart(2, '0');
  const day = match.groups.day.padStart(2, '0');
  const year = match.groups.year;
  return `${year}-${month}-${day}`;
}

function parseLocalDateValue(localDate: string, warnings: string[]): Date | null {
  try {
    return parseLocalDateOnly(localDate);
  } catch {
    addWarning(warnings, `Skipped a row with invalid date "${localDate}".`);
    return null;
  }
}

function parseLoseItTimestamp(raw: string | undefined): Date | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseLoseItDeleted(raw: string | undefined): boolean {
  if (!raw) return false;
  const normalized = raw.trim().toLowerCase();
  return normalized === 'true' || normalized === '1' || normalized === 'yes';
}

/**
 * Parse a CSV document into string-valued rows keyed by header.
 */
function parseCsvRows(csv: string, warnings: string[]): Array<Record<string, string>> {
  const lines = csv.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) return [];

  const headers = parseCsvLine(lines[0]);
  const rows: Array<Record<string, string>> = [];

  for (let idx = 1; idx < lines.length; idx += 1) {
    const values = parseCsvLine(lines[idx]);
    if (values.length === 0) continue;
    if (values.length !== headers.length) {
      addWarning(warnings, 'Skipped a row with mismatched column count.');
      continue;
    }

    const row: Record<string, string> = {};
    for (let col = 0; col < headers.length; col += 1) {
      row[headers[col]] = values[col] ?? '';
    }
    rows.push(row);
  }

  return rows;
}

/**
 * Parse a single CSV line, respecting quotes and escaped quotes.
 */
function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let idx = 0; idx < line.length; idx += 1) {
    const char = line[idx];

    if (char === '"') {
      const nextChar = line[idx + 1];
      if (inQuotes && nextChar === '"') {
        current += '"';
        idx += 1;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }

    if (char === ',' && !inQuotes) {
      values.push(current);
      current = '';
      continue;
    }

    current += char;
  }

  values.push(current);
  return values;
}

function parseMaybeNumber(raw: string | undefined): number | null {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.toLowerCase() === 'n/a') return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

function addWarning(warnings: string[], message: string): void {
  if (warnings.length >= MAX_WARNING_COUNT) return;
  warnings.push(message);
}
