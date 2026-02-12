import bcrypt from 'bcryptjs';
import fs from 'node:fs/promises';
import path from 'node:path';
import prisma from '../config/database';
import { SUPPORTED_LANGUAGES } from '../utils/language';
import { ActivityLevel, HeightUnit, Sex, WeightUnit } from '@prisma/client';
import {
  buildMealLogsForDay,
  getPastDateRangeDates,
  getPastWeekDates,
  getSeedUserCreatedAt,
  getSeedWeightGramsForDayIndex
} from './devTestDataUtils';

/**
 * Deterministic dev seed data helpers (test user, goals, metrics, food logs).
 */
const TEST_USER_EMAIL = 'test@calibratehealth.app';
const TEST_USER_PASSWORD = 'password123';
const TEST_USER_TIMEZONE = 'America/Los_Angeles';

const TEST_USER_DATE_OF_BIRTH = new Date('1990-01-15T00:00:00');
const TEST_USER_HEIGHT_MM = 1750;
const TEST_USER_WEIGHT_GRAMS = 82000;
const TEST_GOAL_TARGET_WEIGHT_GRAMS = 76000;
const TEST_METRIC_HISTORY_DAYS = 120; // Seed roughly four months of weigh-ins so trend charts show noise vs signal.

const PROFILE_PLACEHOLDER_IMAGE_PATH = path.resolve(__dirname, '../../prisma/assets/profile-placeholder.png');
const PROFILE_PLACEHOLDER_IMAGE_MIME_TYPE = 'image/png';

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
      language: SUPPORTED_LANGUAGES.EN,
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
      language: SUPPORTED_LANGUAGES.EN,
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
 * Create daily body metrics for the configured multi-month history without overwriting existing entries.
 */
const ensureBodyMetrics = async (userId: number, days: Date[]): Promise<void> => {
  for (const [index, day] of days.entries()) {
    const existing = await prisma.bodyMetric.findUnique({
      where: { user_id_date: { user_id: userId, date: day } },
      select: { id: true },
    });
    if (existing) continue;

    await prisma.bodyMetric.create({
      data: {
        user_id: userId,
        date: day,
        weight_grams: getSeedWeightGramsForDayIndex(index, TEST_USER_WEIGHT_GRAMS),
      },
    });
  }
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
 * Seed the local database with a deterministic test user and sample tracking history.
 */
export const seedDevTestData = async (): Promise<void> => {
  const metricDays = getPastDateRangeDates(TEST_USER_TIMEZONE, TEST_METRIC_HISTORY_DAYS);
  const foodLogDays = getPastWeekDates(TEST_USER_TIMEZONE);
  const createdAt = getSeedUserCreatedAt(metricDays, TEST_USER_TIMEZONE);

  const user = await ensureTestUser(createdAt);

  await ensureTestGoal(user.id);
  await ensureBodyMetrics(user.id, metricDays);
  await ensureFoodLogs(user.id, foodLogDays);
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
    (await ensureTestUser(getSeedUserCreatedAt(getPastDateRangeDates(TEST_USER_TIMEZONE, TEST_METRIC_HISTORY_DAYS), TEST_USER_TIMEZONE)));

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
