import type { FoodLogDay } from '@prisma/client';
import type { MutationDatabase } from './clientOperations';
import { observeCurrentCaloriePlan } from './dailyCaloriePlans';
import { localDateInTimeZone } from '../../../shared/caloriePolicy';

export type FoodDayCalorieComparison = {
  consumed_kcal: number;
  target_kcal: number;
  maintenance_kcal: number;
  captured_at: string;
};

/** Read saved history only; never reconstruct a completed day's plan from current settings. */
export async function readFoodDayComparison(db: MutationDatabase, day: FoodLogDay): Promise<FoodDayCalorieComparison | null> {
  if (day.status !== 'COMPLETE' || !foodDayCalorieComparison(day, 0)) return null;
  const entries = await db.foodLog.findMany({
    where: { user_id: day.user_id, local_date: day.local_date },
    select: { calories: true }
  });
  const consumed = entries.reduce((total, entry) =>
    total + (Number.isSafeInteger(entry.calories) && entry.calories >= 0 ? entry.calories : NaN), 0);
  return foodDayCalorieComparison(day, consumed);
}

/** Caller holds the account guard before locking/upserting the day, through commit. */
export async function captureFoodDayComparison(db: MutationDatabase, day: FoodLogDay, now: Date): Promise<FoodLogDay> {
  if (day.status !== 'COMPLETE' || day.comparison_captured_at) return day;
  const user = await db.user.findUnique({ where: { id: day.user_id }, select: { timezone: true } });
  const today = user && localDateInTimeZone(now, user.timezone);
  const date = day.local_date.toISOString().slice(0, 10);
  if (!user || !today || date > today) return day;
  if (date === today) await observeCurrentCaloriePlan(db, day.user_id, now);
  const observed = await db.dailyCaloriePlan.findUnique({
    where: { user_id_local_date: { user_id: day.user_id, local_date: day.local_date } }
  });
  const target = observed?.target_kcal;
  const maintenance = observed?.maintenance_kcal;
  const available = observed && !observed.timezone_conflict && observed.timezone === user.timezone &&
    observed.observed_at <= now && localDateInTimeZone(observed.observed_at, observed.timezone) === date &&
    typeof target === 'number' && Number.isSafeInteger(target) && target > 0 &&
    typeof maintenance === 'number' && Number.isSafeInteger(maintenance) && maintenance > 0;
  if (observed && !observed.consumed_at) {
    await db.dailyCaloriePlan.update({ where: { id: observed.id }, data: { consumed_at: now } });
  }
  // Capture unavailable too: later settings changes must not manufacture a plan for this completion.
  return db.foodLogDay.update({ where: { id: day.id }, data: {
    comparison_captured_at: now,
    comparison_target_kcal: available ? target : null,
    comparison_maintenance_kcal: available ? maintenance : null
  } });
}

export function foodDayCalorieComparison(day: {
  comparison_target_kcal?: number | null;
  comparison_maintenance_kcal?: number | null;
  comparison_captured_at?: Date | null;
}, consumed: number): FoodDayCalorieComparison | null {
  const target = day.comparison_target_kcal;
  const maintenance = day.comparison_maintenance_kcal;
  const captured = day.comparison_captured_at;
  if (typeof target !== 'number' || !Number.isSafeInteger(target) || target <= 0 ||
      typeof maintenance !== 'number' || !Number.isSafeInteger(maintenance) || maintenance <= 0 ||
      !Number.isSafeInteger(consumed) || consumed < 0 ||
      !(captured instanceof Date) || !Number.isFinite(captured.getTime())) return null;
  return { consumed_kcal: consumed, target_kcal: target, maintenance_kcal: maintenance, captured_at: captured.toISOString() };
}
