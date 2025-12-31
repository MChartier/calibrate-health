import bcrypt from 'bcryptjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import prisma from '../config/database';
import { ActivityLevel, HeightUnit, MealPeriod, Sex, WeightUnit } from '@prisma/client';
import { formatDateToLocalDateString, normalizeToUtcDateOnly } from '../utils/date';

const TEST_USER_EMAIL = 'test@calibratehealth.app';
const TEST_USER_PASSWORD = 'password123';
const TEST_USER_TIMEZONE = 'America/Los_Angeles';

const TEST_USER_DATE_OF_BIRTH = new Date('1990-01-15T00:00:00');
const TEST_USER_HEIGHT_MM = 1750;
const TEST_USER_WEIGHT_GRAMS = 82000;
const TEST_GOAL_TARGET_WEIGHT_GRAMS = 76000;

const PROFILE_PLACEHOLDER_IMAGE_PATH = path.resolve(__dirname, '../../prisma/assets/profile-placeholder.png');
const PROFILE_PLACEHOLDER_IMAGE_MIME_TYPE = 'image/png';

type MealTemplate = {
  mealPeriod: MealPeriod;
  name: string;
  calories: number;
  hour: number;
  minute?: number;
};

const SEED_MEAL_ITEMS = {
  spinachOmelet: { mealPeriod: MealPeriod.BREAKFAST, name: 'Spinach omelet', calories: 320, hour: 7 },
  sourdoughToast: { mealPeriod: MealPeriod.BREAKFAST, name: 'Sourdough toast', calories: 150, hour: 7, minute: 20 },
  latte: { mealPeriod: MealPeriod.BREAKFAST, name: 'Latte', calories: 120, hour: 8, minute: 10 },

  appleWithPeanutButter: {
    mealPeriod: MealPeriod.MORNING_SNACK,
    name: 'Apple with peanut butter',
    calories: 180,
    hour: 10,
  },
  greekYogurt: { mealPeriod: MealPeriod.MORNING_SNACK, name: 'Greek yogurt', calories: 190, hour: 10 },

  turkeySandwich: { mealPeriod: MealPeriod.LUNCH, name: 'Turkey sandwich', calories: 520, hour: 13 },
  sideSalad: { mealPeriod: MealPeriod.LUNCH, name: 'Side salad', calories: 180, hour: 13, minute: 15 },
  chickenBurritoBowl: { mealPeriod: MealPeriod.LUNCH, name: 'Chicken burrito bowl', calories: 680, hour: 13 },

  proteinShake: { mealPeriod: MealPeriod.AFTERNOON_SNACK, name: 'Protein shake', calories: 210, hour: 16 },
  trailMix: { mealPeriod: MealPeriod.AFTERNOON_SNACK, name: 'Trail mix', calories: 160, hour: 16, minute: 25 },
  granolaBar: { mealPeriod: MealPeriod.AFTERNOON_SNACK, name: 'Granola bar', calories: 140, hour: 16, minute: 20 },

  chickenStirFry: { mealPeriod: MealPeriod.DINNER, name: 'Chicken stir-fry', calories: 650, hour: 19 },
  steamedRice: { mealPeriod: MealPeriod.DINNER, name: 'Steamed rice', calories: 200, hour: 19, minute: 15 },
  roastedVeggies: { mealPeriod: MealPeriod.DINNER, name: 'Roasted veggies', calories: 110, hour: 19, minute: 20 },

  darkChocolateSquare: { mealPeriod: MealPeriod.EVENING_SNACK, name: 'Dark chocolate square', calories: 120, hour: 21 },
  popcorn: { mealPeriod: MealPeriod.EVENING_SNACK, name: 'Popcorn', calories: 150, hour: 21, minute: 5 },
  iceCreamScoop: { mealPeriod: MealPeriod.EVENING_SNACK, name: 'Ice cream scoop', calories: 220, hour: 21, minute: 10 },
} satisfies Record<string, MealTemplate>;

const WEEK_MEAL_PLANS: MealTemplate[][] = [
  // 2160 kcal: full day + extra afternoon snack item (multi-item meal).
  [
    SEED_MEAL_ITEMS.spinachOmelet,
    SEED_MEAL_ITEMS.appleWithPeanutButter,
    SEED_MEAL_ITEMS.turkeySandwich,
    SEED_MEAL_ITEMS.proteinShake,
    SEED_MEAL_ITEMS.trailMix,
    SEED_MEAL_ITEMS.chickenStirFry,
    SEED_MEAL_ITEMS.darkChocolateSquare,
  ],
  // 1900 kcal: no morning snack / evening snack, dinner has multiple items.
  [
    SEED_MEAL_ITEMS.spinachOmelet,
    SEED_MEAL_ITEMS.turkeySandwich,
    SEED_MEAL_ITEMS.proteinShake,
    SEED_MEAL_ITEMS.chickenStirFry,
    SEED_MEAL_ITEMS.steamedRice,
  ],
  // 1740 kcal: lunch empty, breakfast + afternoon snack have multiple items.
  [
    SEED_MEAL_ITEMS.spinachOmelet,
    SEED_MEAL_ITEMS.latte,
    SEED_MEAL_ITEMS.appleWithPeanutButter,
    SEED_MEAL_ITEMS.proteinShake,
    SEED_MEAL_ITEMS.granolaBar,
    SEED_MEAL_ITEMS.chickenStirFry,
    SEED_MEAL_ITEMS.darkChocolateSquare,
  ],
  // 1870 kcal: breakfast empty, lunch has multiple items.
  [
    SEED_MEAL_ITEMS.greekYogurt,
    SEED_MEAL_ITEMS.turkeySandwich,
    SEED_MEAL_ITEMS.sideSalad,
    SEED_MEAL_ITEMS.proteinShake,
    SEED_MEAL_ITEMS.chickenStirFry,
    SEED_MEAL_ITEMS.darkChocolateSquare,
  ],
  // 1540 kcal: dinner empty, swapped lunch + swapped evening snack.
  [
    SEED_MEAL_ITEMS.spinachOmelet,
    SEED_MEAL_ITEMS.appleWithPeanutButter,
    SEED_MEAL_ITEMS.chickenBurritoBowl,
    SEED_MEAL_ITEMS.proteinShake,
    SEED_MEAL_ITEMS.popcorn,
  ],
  // 2050 kcal: afternoon snack empty, breakfast + dinner have multiple items.
  [
    SEED_MEAL_ITEMS.spinachOmelet,
    SEED_MEAL_ITEMS.sourdoughToast,
    SEED_MEAL_ITEMS.appleWithPeanutButter,
    SEED_MEAL_ITEMS.turkeySandwich,
    SEED_MEAL_ITEMS.chickenStirFry,
    SEED_MEAL_ITEMS.roastedVeggies,
    SEED_MEAL_ITEMS.darkChocolateSquare,
  ],
  // 2040 kcal: morning snack empty, breakfast swapped in extra item + higher-cal evening snack.
  [
    SEED_MEAL_ITEMS.spinachOmelet,
    SEED_MEAL_ITEMS.latte,
    SEED_MEAL_ITEMS.turkeySandwich,
    SEED_MEAL_ITEMS.proteinShake,
    SEED_MEAL_ITEMS.chickenStirFry,
    SEED_MEAL_ITEMS.iceCreamScoop,
  ],
];

type SeedProfileImage = {
  mimeType: string;
  bytes: Uint8Array<ArrayBuffer>;
};

let cachedProfilePlaceholderImage: SeedProfileImage | null | undefined;

/**
 * Load (and memoize) the placeholder avatar used for deterministic dev accounts.
 */
const loadProfilePlaceholderImage = async (): Promise<SeedProfileImage | null> => {
  if (cachedProfilePlaceholderImage !== undefined) {
    return cachedProfilePlaceholderImage;
  }

  try {
    const buffer = await fs.readFile(PROFILE_PLACEHOLDER_IMAGE_PATH);
    // Prisma `Bytes` columns are typed as Uint8Array; normalize eagerly for type safety.
    const bytes = new Uint8Array(buffer.length);
    bytes.set(buffer);
    cachedProfilePlaceholderImage = { bytes, mimeType: PROFILE_PLACEHOLDER_IMAGE_MIME_TYPE };
  } catch (error) {
    cachedProfilePlaceholderImage = null;
    console.warn('Dev seed: unable to load profile placeholder image:', error);
  }

  return cachedProfilePlaceholderImage;
};

/**
 * Build a new date-only value by adding the provided day offset (UTC, no DST surprises).
 */
const addUtcDays = (date: Date, offset: number): Date => {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + offset);
  return result;
};

/**
 * Return an array of UTC-normalized DATE values covering the past week in the provided time zone.
 */
const getPastWeekDates = (timeZone: string, now: Date = new Date()): Date[] => {
  const todayLocalDate = formatDateToLocalDateString(now, timeZone);
  const today = normalizeToUtcDateOnly(todayLocalDate);
  return Array.from({ length: 7 }, (_, index) => addUtcDays(today, index - 6));
};

/**
 * Choose a deterministic created_at timestamp that won't hide seeded history in the /log date picker.
 *
 * The /log page clamps its minimum selectable day to the user's account creation local day.
 * We set created_at to land on the earliest seeded local_date (when formatted in the user's
 * timezone), so all generated seed days remain selectable without widening bounds globally.
 */
const getSeedUserCreatedAt = (seedDays: Date[], timeZone: string): Date => {
  const earliestSeedDay = seedDays[0];
  if (!earliestSeedDay) {
    return new Date();
  }

  const seedDateIso = earliestSeedDay.toISOString().slice(0, 10);
  const candidateHoursUtc = [12, 0, 6, 18];

  for (const hour of candidateHoursUtc) {
    const candidate = new Date(earliestSeedDay);
    candidate.setUTCHours(hour, 0, 0, 0);

    try {
      if (formatDateToLocalDateString(candidate, timeZone) === seedDateIso) {
        return candidate;
      }
    } catch {
      // Ignore invalid timezone inputs (we'll fall back to a best-effort value below).
    }
  }

  const fallback = new Date(earliestSeedDay);
  fallback.setUTCHours(12, 0, 0, 0);
  return fallback;
};

/**
 * Ensure a deterministic test user exists (and always has the expected password).
 */
const ensureTestUser = async (createdAt: Date): Promise<{ id: number }> => {
  const passwordHash = await bcrypt.hash(TEST_USER_PASSWORD, 10);
  const placeholderImage = await loadProfilePlaceholderImage();
  const placeholderImageData = placeholderImage
    ? { profile_image: placeholderImage.bytes, profile_image_mime_type: placeholderImage.mimeType }
    : {};

  return prisma.user.upsert({
    where: { email: TEST_USER_EMAIL },
    create: {
      email: TEST_USER_EMAIL,
      password_hash: passwordHash,
      created_at: createdAt,
      timezone: TEST_USER_TIMEZONE,
      weight_unit: WeightUnit.KG,
      height_unit: HeightUnit.CM,
      date_of_birth: TEST_USER_DATE_OF_BIRTH,
      sex: Sex.MALE,
      height_mm: TEST_USER_HEIGHT_MM,
      activity_level: ActivityLevel.MODERATE,
      ...placeholderImageData,
    },
    update: {
      // Keep the dev user deterministic so "invalid credentials" doesn't happen
      // if the account already existed with a different password.
      password_hash: passwordHash,
      created_at: createdAt,
      timezone: TEST_USER_TIMEZONE,
      weight_unit: WeightUnit.KG,
      height_unit: HeightUnit.CM,
      date_of_birth: TEST_USER_DATE_OF_BIRTH,
      sex: Sex.MALE,
      height_mm: TEST_USER_HEIGHT_MM,
      activity_level: ActivityLevel.MODERATE,
      ...placeholderImageData,
    },
    select: { id: true },
  });
};

/**
 * Ensure the test user has a starting goal for deficit calculations.
 */
const ensureTestGoal = async (userId: number): Promise<void> => {
  const existing = await prisma.goal.findFirst({ where: { user_id: userId } });
  if (existing) return;

  await prisma.goal.create({
    data: {
      user_id: userId,
      start_weight_grams: TEST_USER_WEIGHT_GRAMS,
      target_weight_grams: TEST_GOAL_TARGET_WEIGHT_GRAMS,
      daily_deficit: 500,
    },
  });
};

/**
 * Create daily body metrics for the past week without overwriting existing entries.
 */
const ensureBodyMetrics = async (userId: number, days: Date[]): Promise<void> => {
  for (const [index, day] of days.entries()) {
    const existing = await prisma.bodyMetric.findUnique({
      where: { user_id_date: { user_id: userId, date: day } },
      select: { id: true },
    });
    if (existing) continue;

    const weightAdjustment = (days.length - 1 - index) * 150;
    await prisma.bodyMetric.create({
      data: {
        user_id: userId,
        date: day,
        weight_grams: TEST_USER_WEIGHT_GRAMS - weightAdjustment,
      },
    });
  }
};

/**
 * Return a deterministic-but-varied meal plan for the provided seed day index.
 *
 * This keeps local dev data reproducible while exercising UI states like:
 * - different day totals
 * - empty meals (no items for a meal period)
 * - multi-item meals (multiple food logs in one meal period)
 */
const getMealTemplatesForSeedDayIndex = (dayIndex: number): MealTemplate[] => {
  const plan = WEEK_MEAL_PLANS[dayIndex % WEEK_MEAL_PLANS.length];
  return plan ?? [];
};

/**
 * Build meal logs for a given day using the varied seed templates.
 */
const buildMealLogsForDay = (
  userId: number,
  day: Date,
  dayIndex: number
): Array<{
  user_id: number;
  date: Date;
  local_date: Date;
  meal_period: MealPeriod;
  name: string;
  calories: number;
}> => {
  const templates = getMealTemplatesForSeedDayIndex(dayIndex);

  return templates.map((template) => {
    const mealDate = new Date(day);
    mealDate.setUTCHours(template.hour, template.minute ?? 0, 0, 0);
    return {
      user_id: userId,
      date: mealDate,
      local_date: day,
      meal_period: template.mealPeriod,
      name: template.name,
      calories: template.calories,
    };
  });
};

/**
 * Create daily food logs for the past week without duplicating existing entries.
 */
const ensureFoodLogs = async (userId: number, days: Date[]): Promise<void> => {
  for (const [dayIndex, day] of days.entries()) {
    const existingCount = await prisma.foodLog.count({
      where: {
        user_id: userId,
        local_date: day,
      },
    });
    if (existingCount > 0) continue;

    await prisma.foodLog.createMany({
      data: buildMealLogsForDay(userId, day, dayIndex),
    });
  }
};

/**
 * Seed the local database with a test user and a week of sample data.
 */
export const seedDevTestData = async (): Promise<void> => {
  const days = getPastWeekDates(TEST_USER_TIMEZONE);
  const createdAt = getSeedUserCreatedAt(days, TEST_USER_TIMEZONE);

  const user = await ensureTestUser(createdAt);

  await ensureTestGoal(user.id);
  await ensureBodyMetrics(user.id, days);
  await ensureFoodLogs(user.id, days);
};

/**
 * Reset the deterministic dev test account back to a pre-onboarding state.
 *
 * This keeps the email/password stable for auto-login, but clears the fields that the frontend
 * uses to decide whether onboarding is required.
 */
export const resetDevTestUserToPreOnboardingState = async (): Promise<number> => {
  const existing = await prisma.user.findUnique({
    where: { email: TEST_USER_EMAIL },
    select: { id: true },
  });
  const user =
    existing ??
    (await ensureTestUser(getSeedUserCreatedAt(getPastWeekDates(TEST_USER_TIMEZONE), TEST_USER_TIMEZONE)));

  await prisma.$transaction(async (tx) => {
    await tx.goal.deleteMany({ where: { user_id: user.id } });
    await tx.bodyMetric.deleteMany({ where: { user_id: user.id } });
    await tx.foodLog.deleteMany({ where: { user_id: user.id } });

    await tx.user.update({
      where: { id: user.id },
      data: {
        date_of_birth: null,
        sex: null,
        height_mm: null,
        activity_level: null,
        profile_image: null,
        profile_image_mime_type: null,
      },
      select: { id: true },
    });
  });

  return user.id;
};

let seedOncePromise: Promise<void> | null = null;

/**
 * Ensure dev test data exists; safe to call multiple times (memoized per process).
 */
export const ensureDevTestData = async (): Promise<void> => {
  if (!seedOncePromise) {
    seedOncePromise = seedDevTestData().catch((error) => {
      seedOncePromise = null;
      throw error;
    });
  }

  await seedOncePromise;
};
