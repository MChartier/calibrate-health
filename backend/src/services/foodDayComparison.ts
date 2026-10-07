import type { FoodLogDay } from '@prisma/client';
import type { MutationDatabase } from './clientOperations';
import { buildStoredCaloriePlanningSnapshot } from './caloriePlanning';
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

/** The caller has upserted (and locked) this day in the completion transaction. */
export async function captureFoodDayComparison(db: MutationDatabase, day: FoodLogDay, now: Date): Promise<FoodLogDay> {
  if (day.status !== 'COMPLETE' || day.comparison_captured_at) return day;
  const user = await db.user.findUnique({ where: { id: day.user_id }, select: { timezone: true } });
  if (!user || localDateInTimeZone(now, user.timezone) !== day.local_date.toISOString().slice(0, 10)) return day;
  const plan = await buildStoredCaloriePlanningSnapshot(db, day.user_id, now);
  const evaluation = plan?.evaluation;
  const target = evaluation?.dailyCalorieTarget;
  const maintenance = evaluation?.tdee;
  const available = plan?.localToday === day.local_date.toISOString().slice(0, 10) && evaluation?.status === 'available' &&
    typeof target === 'number' && Number.isSafeInteger(target) && target > 0 &&
    typeof maintenance === 'number' && Number.isFinite(maintenance) && maintenance > 0;
  // Capture unavailable too: later settings changes must not manufacture a plan for this completion.
  return db.foodLogDay.update({ where: { id: day.id }, data: {
    comparison_captured_at: now,
    comparison_target_kcal: available ? target : null,
    comparison_maintenance_kcal: available ? Math.round(maintenance) : null
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
