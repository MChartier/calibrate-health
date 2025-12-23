import bcrypt from 'bcryptjs';
import prisma from '../config/database';
import { ActivityLevel, MealPeriod, Sex, WeightUnit } from '@prisma/client';

const TEST_USER_EMAIL = 'test@cal.io';
const TEST_USER_PASSWORD = 'password123';

const TEST_USER_DATE_OF_BIRTH = new Date('1990-01-15T00:00:00');
const TEST_USER_HEIGHT_MM = 1750;
const TEST_USER_WEIGHT_GRAMS = 82000;
const TEST_GOAL_TARGET_WEIGHT_GRAMS = 76000;

type MealTemplate = {
  mealPeriod: MealPeriod;
  name: string;
  calories: number;
  hour: number;
};

const MEAL_TEMPLATES: MealTemplate[] = [
  { mealPeriod: MealPeriod.BREAKFAST, name: 'Spinach omelet', calories: 320, hour: 7 },
  { mealPeriod: MealPeriod.MORNING_SNACK, name: 'Apple with peanut butter', calories: 180, hour: 10 },
  { mealPeriod: MealPeriod.LUNCH, name: 'Turkey sandwich', calories: 520, hour: 13 },
  { mealPeriod: MealPeriod.AFTERNOON_SNACK, name: 'Protein shake', calories: 210, hour: 16 },
  { mealPeriod: MealPeriod.DINNER, name: 'Chicken stir-fry', calories: 650, hour: 19 },
  { mealPeriod: MealPeriod.EVENING_SNACK, name: 'Dark chocolate square', calories: 120, hour: 21 },
];

/**
 * Return a new Date with the same calendar day and time cleared to local midnight.
 */
const startOfLocalDay = (date: Date): Date => {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
};

/**
 * Return a new Date that represents the final millisecond of the local day.
 */
const endOfLocalDay = (date: Date): Date => {
  const result = new Date(date);
  result.setHours(23, 59, 59, 999);
  return result;
};

/**
 * Build a new Date by adding the provided day offset to the base date.
 */
const addDays = (date: Date, offset: number): Date => {
  const result = new Date(date);
  result.setDate(result.getDate() + offset);
  return result;
};

/**
 * Return an array of Dates covering the past week, ending with today.
 */
const getPastWeekDates = (): Date[] => {
  const today = startOfLocalDay(new Date());
  return Array.from({ length: 7 }, (_, index) => addDays(today, index - 6));
};

/**
 * Ensure a deterministic test user exists (and always has the expected password).
 */
const ensureTestUser = async (): Promise<{ id: number }> => {
  const passwordHash = await bcrypt.hash(TEST_USER_PASSWORD, 10);
  return prisma.user.upsert({
    where: { email: TEST_USER_EMAIL },
    create: {
      email: TEST_USER_EMAIL,
      password_hash: passwordHash,
      weight_unit: WeightUnit.KG,
      date_of_birth: TEST_USER_DATE_OF_BIRTH,
      sex: Sex.MALE,
      height_mm: TEST_USER_HEIGHT_MM,
      activity_level: ActivityLevel.MODERATE,
    },
    update: {
      // Keep the dev user deterministic so "invalid credentials" doesn't happen
      // if the account already existed with a different password.
      password_hash: passwordHash,
      weight_unit: WeightUnit.KG,
      date_of_birth: TEST_USER_DATE_OF_BIRTH,
      sex: Sex.MALE,
      height_mm: TEST_USER_HEIGHT_MM,
      activity_level: ActivityLevel.MODERATE,
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
    const date = startOfLocalDay(day);
    const existing = await prisma.bodyMetric.findUnique({
      where: { user_id_date: { user_id: userId, date } },
      select: { id: true },
    });
    if (existing) continue;

    const weightAdjustment = (days.length - 1 - index) * 150;
    await prisma.bodyMetric.create({
      data: {
        user_id: userId,
        date,
        weight_grams: TEST_USER_WEIGHT_GRAMS - weightAdjustment,
      },
    });
  }
};

/**
 * Build meal logs for a given day using fixed templates.
 */
const buildMealLogsForDay = (
  userId: number,
  day: Date
): Array<{
  user_id: number;
  date: Date;
  meal_period: MealPeriod;
  name: string;
  calories: number;
}> => {
  return MEAL_TEMPLATES.map((template) => {
    const mealDate = new Date(day);
    mealDate.setHours(template.hour, 0, 0, 0);
    return {
      user_id: userId,
      date: mealDate,
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
  for (const day of days) {
    const start = startOfLocalDay(day);
    const end = endOfLocalDay(day);
    const existingCount = await prisma.foodLog.count({
      where: {
        user_id: userId,
        date: { gte: start, lte: end },
      },
    });
    if (existingCount > 0) continue;

    await prisma.foodLog.createMany({
      data: buildMealLogsForDay(userId, day),
    });
  }
};

/**
 * Seed the local database with a test user and a week of sample data.
 */
export const seedDevTestData = async (): Promise<void> => {
  const user = await ensureTestUser();
  const days = getPastWeekDates();

  await ensureTestGoal(user.id);
  await ensureBodyMetrics(user.id, days);
  await ensureFoodLogs(user.id, days);
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
