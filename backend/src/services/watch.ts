import crypto from 'node:crypto';
import { MobileDevicePlatform, Prisma } from '@prisma/client';
import prisma from '../config/database';
import { getRecentFoodSuggestions, type RecentFoodSuggestion } from './recentFoods';
import { buildCalorieSummary } from '../utils/profile';
import { formatDateToLocalDateString, parseLocalDateOnly } from '../utils/date';
import { parseFoodLogCreateBody } from '../routes/foodUtils';
import { executeIdempotentMutation, recordSyncChange, type MutationDatabase } from './clientOperations';
import { refreshMaterializedWeightTrendsBestEffort } from './materializedWeightTrend';

const WATCH_QUICK_ADD_LIMIT = 12;
const WATCH_PINNED_LIMIT = 6;
const WATCH_RECENT_LIMIT = 12;
const ACTIVITY_STALE_AFTER_MS = 2 * 60 * 60 * 1000;
const MAX_WATCH_WEIGHT_GRAMS = 1_000_000;
const ENTITY_REVISION_PATTERN = /^[a-f0-9]{24}$/;

const FOOD_CREATE_KEYS = new Set([
  'date', 'meal_period', 'my_food_id', 'servings_consumed', 'name', 'calories',
  'serving_size_quantity_snapshot', 'serving_unit_label_snapshot', 'calories_per_serving_snapshot',
  'external_source', 'external_id', 'brand', 'locale', 'barcode', 'measure_label',
  'grams_per_measure_snapshot', 'measure_quantity_snapshot', 'grams_total_snapshot'
]);

type WatchMutationType = 'food.create' | 'food.delete' | 'metric.upsert' | 'food_day.set_complete';

type ParsedWatchMutation =
  | { ok: true; type: 'food.create'; payload: Record<string, unknown>; parsedFood: Extract<ReturnType<typeof parseFoodLogCreateBody>, { ok: true }> }
  | { ok: true; type: 'food.delete'; payload: { food_log_id: number } }
  | { ok: true; type: 'metric.upsert'; payload: { local_date: string; weight_grams: number; expected_revision: string | null }; metricDate: Date }
  | { ok: true; type: 'food_day.set_complete'; payload: { local_date: string; is_complete: boolean; expected_revision: string | null }; localDate: Date }
  | { ok: false; status: 400; message: string };

type WatchUndoCandidate = {
  food_log_id: number;
  name: string;
  calories: number;
  created_at: string;
};

const isObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

const hasOnlyKeys = (value: Record<string, unknown>, allowed: ReadonlySet<string>): boolean =>
  Object.keys(value).every((key) => allowed.has(key));

const parsePositiveInteger = (value: unknown): number | null =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0 ? value : null;

const parseExpectedRevision = (value: unknown): string | null | undefined => {
  if (value === null) return null;
  if (typeof value !== 'string') return undefined;
  const normalized = value.trim().toLowerCase();
  return ENTITY_REVISION_PATTERN.test(normalized) ? normalized : undefined;
};

const entityRevision = (kind: string, value: unknown): string => crypto.createHash('sha256')
  .update(JSON.stringify({ kind, value }))
  .digest('hex')
  .slice(0, 24);

const metricRevision = (metric: { id: number; date: Date; weight_grams: number; body_fat_percent?: number | null }): string =>
  entityRevision('body_metric', {
    id: metric.id,
    local_date: metric.date.toISOString().slice(0, 10),
    weight_grams: metric.weight_grams,
    body_fat_percent: metric.body_fat_percent ?? null
  });

const foodDayRevision = (day: { id: number; local_date: Date; is_complete: boolean; completed_at: Date | null; updated_at: Date }): string =>
  entityRevision('food_log_day', {
    id: day.id,
    local_date: day.local_date.toISOString().slice(0, 10),
    is_complete: day.is_complete,
    completed_at: day.completed_at?.toISOString() ?? null,
    updated_at: day.updated_at.toISOString()
  });

export function parseWatchMutation(body: unknown, options: {
  timezone: string;
  now?: Date;
}): ParsedWatchMutation {
  if (!isObject(body) || typeof body.type !== 'string' || !isObject(body.payload)) {
    return { ok: false, status: 400, message: 'Invalid watch mutation request' };
  }
  const type = body.type as WatchMutationType;
  const payload = body.payload;
  const now = options.now ?? new Date();

  if (type === 'food.create') {
    if (!hasOnlyKeys(payload, FOOD_CREATE_KEYS) || typeof payload.date !== 'string') {
      return { ok: false, status: 400, message: 'Invalid food.create payload' };
    }
    const parsedFood = parseFoodLogCreateBody({ body: payload, userTimeZone: options.timezone, now });
    if (!parsedFood.ok) return { ok: false, status: 400, message: parsedFood.message };
    return { ok: true, type, payload, parsedFood };
  }

  if (type === 'food.delete') {
    if (!hasOnlyKeys(payload, new Set(['food_log_id']))) {
      return { ok: false, status: 400, message: 'Invalid food.delete payload' };
    }
    const foodLogId = parsePositiveInteger(payload.food_log_id);
    return foodLogId
      ? { ok: true, type, payload: { food_log_id: foodLogId } }
      : { ok: false, status: 400, message: 'Invalid food_log_id' };
  }

  if (type === 'metric.upsert') {
    if (!hasOnlyKeys(payload, new Set(['local_date', 'weight_grams', 'expected_revision']))) {
      return { ok: false, status: 400, message: 'Invalid metric.upsert payload' };
    }
    const weightGrams = parsePositiveInteger(payload.weight_grams);
    const expectedRevision = parseExpectedRevision(payload.expected_revision);
    if (!weightGrams || weightGrams > MAX_WATCH_WEIGHT_GRAMS) {
      return { ok: false, status: 400, message: 'Invalid weight_grams' };
    }
    if (expectedRevision === undefined) {
      return { ok: false, status: 400, message: 'Invalid expected_revision' };
    }
    try {
      if (typeof payload.local_date !== 'string') throw new Error('Invalid local date');
      const metricDate = parseLocalDateOnly(payload.local_date);
      return {
        ok: true,
        type,
        payload: { local_date: metricDate.toISOString().slice(0, 10), weight_grams: weightGrams, expected_revision: expectedRevision },
        metricDate
      };
    } catch {
      return { ok: false, status: 400, message: 'Invalid local_date' };
    }
  }

  if (type === 'food_day.set_complete') {
    const expectedRevision = parseExpectedRevision(payload.expected_revision);
    if (
      !hasOnlyKeys(payload, new Set(['local_date', 'is_complete', 'expected_revision'])) ||
      typeof payload.is_complete !== 'boolean' ||
      expectedRevision === undefined
    ) {
      return { ok: false, status: 400, message: 'Invalid food_day.set_complete payload' };
    }
    try {
      const localDate = parseLocalDateOnly(payload.local_date);
      return {
        ok: true,
        type,
        payload: { local_date: localDate.toISOString().slice(0, 10), is_complete: payload.is_complete, expected_revision: expectedRevision },
        localDate
      };
    } catch {
      return { ok: false, status: 400, message: 'Invalid local_date' };
    }
  }

  return { ok: false, status: 400, message: 'Unsupported watch mutation type' };
}

const responseFoodLogId = (body: unknown): number | null => {
  if (!isObject(body) || !isObject(body.food_log)) return null;
  return parsePositiveInteger(body.food_log.id);
};

const serializeWatchFoodLog = (log: any) => ({
  id: log.id,
  date: log.date.toISOString(),
  local_date: log.local_date.toISOString().slice(0, 10),
  meal_period: log.meal_period,
  name: log.name,
  calories: log.calories,
  my_food_id: log.my_food_id ?? null,
  servings_consumed: log.servings_consumed ?? null,
  serving_size_quantity_snapshot: log.serving_size_quantity_snapshot ?? null,
  serving_unit_label_snapshot: log.serving_unit_label_snapshot ?? null,
  calories_per_serving_snapshot: log.calories_per_serving_snapshot ?? null,
  external_source: log.external_source ?? null,
  external_id: log.external_id ?? null,
  brand_snapshot: log.brand_snapshot ?? null,
  locale_snapshot: log.locale_snapshot ?? null,
  barcode_snapshot: log.barcode_snapshot ?? null,
  measure_label_snapshot: log.measure_label_snapshot ?? null,
  grams_per_measure_snapshot: log.grams_per_measure_snapshot ?? null,
  measure_quantity_snapshot: log.measure_quantity_snapshot ?? null,
  grams_total_snapshot: log.grams_total_snapshot ?? null,
  created_at: log.created_at.toISOString()
});

async function findCurrentSessionUndoCandidate(options: {
  tx: MutationDatabase;
  userId: number;
  mobileAuthSessionId: number;
}): Promise<WatchUndoCandidate | null> {
  const receipt = await options.tx.clientOperation.findFirst({
    where: {
      user_id: options.userId,
      mobile_auth_session_id: options.mobileAuthSessionId,
      operation_kind: 'watch.food.create',
      response_status: 200,
      completed_at: { not: null }
    },
    orderBy: [{ completed_at: 'desc' }, { id: 'desc' }],
    select: { operation_id: true, response_body: true }
  });
  const foodLogId = receipt ? responseFoodLogId(receipt.response_body) : null;
  if (!receipt || foodLogId === null) return null;
  const createChange = await options.tx.syncChange.findFirst({
    where: {
      user_id: options.userId,
      entity_type: 'food_log',
      entity_id: String(foodLogId),
      operation_id: receipt.operation_id,
      action: 'upsert'
    },
    orderBy: { id: 'desc' },
    select: { id: true }
  });
  if (!createChange) return null;
  const laterChange = await options.tx.syncChange.findFirst({
    where: {
      user_id: options.userId,
      entity_type: 'food_log',
      entity_id: String(foodLogId),
      id: { gt: createChange.id }
    },
    select: { id: true }
  });
  if (laterChange) return null;
  const log = await options.tx.foodLog.findFirst({
    where: { user_id: options.userId, id: foodLogId },
    select: { id: true, name: true, calories: true, created_at: true }
  });
  return log
    ? { food_log_id: log.id, name: log.name, calories: log.calories, created_at: log.created_at.toISOString() }
    : null;
}

async function createFoodLog(options: {
  tx: MutationDatabase;
  userId: number;
  operationId?: string;
  parsed: Extract<ReturnType<typeof parseFoodLogCreateBody>, { ok: true }>;
}) {
  const parsed = options.parsed;
  if (parsed.kind === 'MY_FOOD') {
    const myFood = await options.tx.myFood.findFirst({ where: { id: parsed.myFoodId, user_id: options.userId } });
    if (!myFood) return { status: 404, body: { message: 'My food not found' } };
    const log = await options.tx.foodLog.create({
      data: {
        user_id: options.userId,
        my_food_id: myFood.id,
        name: myFood.name,
        calories: Math.round(parsed.servingsConsumed * myFood.calories_per_serving),
        meal_period: parsed.mealPeriod,
        date: parsed.entryTimestamp,
        local_date: parsed.localDate,
        servings_consumed: parsed.servingsConsumed,
        serving_size_quantity_snapshot: myFood.serving_size_quantity,
        serving_unit_label_snapshot: myFood.serving_unit_label,
        calories_per_serving_snapshot: myFood.calories_per_serving
      }
    });
    await recordSyncChange({ tx: options.tx, userId: options.userId, entityType: 'food_log', entityId: log.id, action: 'upsert', operationId: options.operationId, payload: log });
    return { status: 200, body: { type: 'food.create', food_log: serializeWatchFoodLog(log) } };
  }

  const log = await options.tx.foodLog.create({
    data: {
      user_id: options.userId,
      name: parsed.name,
      calories: parsed.calories,
      meal_period: parsed.mealPeriod,
      date: parsed.entryTimestamp,
      local_date: parsed.localDate,
      servings_consumed: parsed.servingsConsumed,
      serving_size_quantity_snapshot: parsed.servingSizeQuantitySnapshot,
      serving_unit_label_snapshot: parsed.servingUnitLabelSnapshot,
      calories_per_serving_snapshot: parsed.caloriesPerServingSnapshot,
      external_source: parsed.externalSource,
      external_id: parsed.externalId,
      brand_snapshot: parsed.brandSnapshot,
      locale_snapshot: parsed.localeSnapshot,
      barcode_snapshot: parsed.barcodeSnapshot,
      measure_label_snapshot: parsed.measureLabelSnapshot,
      grams_per_measure_snapshot: parsed.gramsPerMeasureSnapshot,
      measure_quantity_snapshot: parsed.measureQuantitySnapshot,
      grams_total_snapshot: parsed.gramsTotalSnapshot
    }
  });
  await recordSyncChange({ tx: options.tx, userId: options.userId, entityType: 'food_log', entityId: log.id, action: 'upsert', operationId: options.operationId, payload: log });
  return { status: 200, body: { type: 'food.create', food_log: serializeWatchFoodLog(log) } };
}

export async function executeWatchMutation(options: {
  userId: number;
  mobileAuthSessionId: number;
  operationId: string;
  mutation: Extract<ParsedWatchMutation, { ok: true }>;
}) {
  const result = await executeIdempotentMutation<unknown>({
    userId: options.userId,
    mobileAuthSessionId: options.mobileAuthSessionId,
    operationId: options.operationId,
    operationKind: `watch.${options.mutation.type}`,
    requestPayload: { type: options.mutation.type, payload: options.mutation.payload },
    mutate: async (tx, claimedOperationId) => {
      const mutation = options.mutation;
      if (mutation.type === 'food.create') {
        return createFoodLog({ tx, userId: options.userId, operationId: claimedOperationId, parsed: mutation.parsedFood });
      }
      if (mutation.type === 'food.delete') {
        const candidate = await findCurrentSessionUndoCandidate({ tx, userId: options.userId, mobileAuthSessionId: options.mobileAuthSessionId });
        if (!candidate || candidate.food_log_id !== mutation.payload.food_log_id) {
          return { status: 409, body: { message: 'Food log is not the current session undo candidate', code: 'WATCH_UNDO_NOT_ALLOWED', retryable: false } };
        }
        const deleted = await tx.foodLog.deleteMany({ where: { id: candidate.food_log_id, user_id: options.userId } });
        if (deleted.count !== 1) return { status: 404, body: { message: 'Food log not found' } };
        await recordSyncChange({ tx, userId: options.userId, entityType: 'food_log', entityId: candidate.food_log_id, action: 'delete', operationId: claimedOperationId });
        return { status: 200, body: { type: 'food.delete', food_log_id: candidate.food_log_id, deleted: true } };
      }
      if (mutation.type === 'metric.upsert') {
        const existing = await tx.bodyMetric.findUnique({
          where: { user_id_date: { user_id: options.userId, date: mutation.metricDate } }
        });
        const currentRevision = existing ? metricRevision(existing) : null;
        if (currentRevision !== mutation.payload.expected_revision) {
          return {
            status: 409,
            body: {
              message: 'Weight changed since the watch snapshot',
              code: 'ENTITY_CONFLICT',
              retryable: false,
              current: existing ? {
                local_date: mutation.payload.local_date,
                weight_grams: existing.weight_grams,
                revision: currentRevision
              } : null
            }
          };
        }
        const metric = await tx.bodyMetric.upsert({
          where: { user_id_date: { user_id: options.userId, date: mutation.metricDate } },
          update: { weight_grams: mutation.payload.weight_grams },
          create: { user_id: options.userId, date: mutation.metricDate, weight_grams: mutation.payload.weight_grams }
        });
        await recordSyncChange({ tx, userId: options.userId, entityType: 'body_metric', entityId: metric.id, action: 'upsert', operationId: claimedOperationId, payload: metric });
        return {
          status: 200,
          body: {
            type: 'metric.upsert',
            metric: {
              id: metric.id,
              local_date: mutation.payload.local_date,
              weight_grams: metric.weight_grams,
              revision: metricRevision(metric)
            }
          }
        };
      }

      const existingDay = await tx.foodLogDay.findUnique({
        where: { user_id_local_date: { user_id: options.userId, local_date: mutation.localDate } }
      });
      const currentRevision = existingDay ? foodDayRevision(existingDay) : null;
      if (currentRevision !== mutation.payload.expected_revision) {
        return {
          status: 409,
          body: {
            message: 'Food completion changed since the watch snapshot',
            code: 'ENTITY_CONFLICT',
            retryable: false,
            current: existingDay ? {
              date: mutation.payload.local_date,
              is_complete: existingDay.is_complete,
              completed_at: existingDay.completed_at,
              revision: currentRevision
            } : null
          }
        };
      }
      const completedAt = mutation.payload.is_complete ? new Date() : null;
      const day = await tx.foodLogDay.upsert({
        where: { user_id_local_date: { user_id: options.userId, local_date: mutation.localDate } },
        update: { is_complete: mutation.payload.is_complete, completed_at: completedAt },
        create: { user_id: options.userId, local_date: mutation.localDate, is_complete: mutation.payload.is_complete, completed_at: completedAt }
      });
      const body = {
        type: 'food_day.set_complete',
        food_day: {
          date: mutation.payload.local_date,
          is_complete: day.is_complete,
          completed_at: day.completed_at,
          revision: foodDayRevision(day)
        }
      };
      await recordSyncChange({ tx, userId: options.userId, entityType: 'food_log_day', entityId: mutation.payload.local_date, action: 'upsert', operationId: claimedOperationId, payload: body.food_day });
      return { status: 200, body };
    }
  });
  if (options.mutation.type === 'metric.upsert' && result.status === 200) {
    await refreshMaterializedWeightTrendsBestEffort(options.userId);
  }
  return result;
}

const localHour = (now: Date, timezone: string): number => {
  const hour = new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: '2-digit', hourCycle: 'h23' })
    .formatToParts(now).find((part) => part.type === 'hour')?.value;
  return Number(hour ?? 12);
};

const suggestedMealPeriod = (now: Date, timezone: string): string => {
  const hour = localHour(now, timezone);
  if (hour < 10) return 'BREAKFAST';
  if (hour < 12) return 'MORNING_SNACK';
  if (hour < 15) return 'LUNCH';
  if (hour < 17) return 'AFTERNOON_SNACK';
  if (hour < 21) return 'DINNER';
  return 'EVENING_SNACK';
};

const recentDraft = (
  item: RecentFoodSuggestion,
  currentMyFood?: { id: number; name: string; calories_per_serving: number }
) => {
  if (item.my_food_id) {
    if (!currentMyFood) return null;
    const servings = item.servings_consumed ?? 1;
    return {
      id: item.id,
      source: 'recent' as const,
      label: currentMyFood.name,
      calories: Math.round(servings * currentMyFood.calories_per_serving),
      draft: { meal_period: item.meal_period, my_food_id: currentMyFood.id, servings_consumed: servings }
    };
  }
  return {
    id: item.id,
    source: 'recent' as const,
    label: item.name,
    calories: item.calories,
    draft: {
        meal_period: item.meal_period,
        name: item.name,
        calories: item.calories,
        servings_consumed: item.servings_consumed,
        serving_size_quantity_snapshot: item.serving_size_quantity_snapshot,
        serving_unit_label_snapshot: item.serving_unit_label_snapshot,
        calories_per_serving_snapshot: item.calories_per_serving_snapshot,
        external_source: item.external_source,
        external_id: item.external_id,
        brand: item.brand_snapshot,
        locale: item.locale_snapshot,
        barcode: item.barcode_snapshot,
        measure_label: item.measure_label_snapshot,
        grams_per_measure_snapshot: item.grams_per_measure_snapshot,
        measure_quantity_snapshot: item.measure_quantity_snapshot,
        grams_total_snapshot: item.grams_total_snapshot
      }
  };
};

export async function buildWatchSnapshot(options: {
  userId: number;
  mobileAuthSessionId: number;
  now?: Date;
}) {
  const now = options.now ?? new Date();
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: options.userId },
      select: { id: true, timezone: true, language: true, weight_unit: true, height_unit: true, sex: true, date_of_birth: true, height_mm: true, activity_level: true }
    });
    if (!user) return null;
    const localDateKey = formatDateToLocalDateString(now, user.timezone);
    const localDate = parseLocalDateOnly(localDateKey);

    const activeReminderPromise = 'inAppNotification' in tx
      ? tx.inAppNotification.findMany({
          where: {
            user_id: options.userId,
            local_date: localDate,
            type: { in: ['LOG_WEIGHT_REMINDER', 'LOG_FOOD_REMINDER'] },
            read_at: null,
            dismissed_at: null,
            resolved_at: null
          },
          orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
          take: 10,
          select: { id: true, type: true, local_date: true, created_at: true }
        })
      : Promise.resolve([]);
    const [goal, latestWeight, todayWeight, foodAggregate, activity, foodDay, pinned, recent, undoCandidate, activeReminderRows] = await Promise.all([
      tx.goal.findFirst({ where: { user_id: options.userId }, orderBy: [{ created_at: 'desc' }, { id: 'desc' }] }),
      tx.bodyMetric.findFirst({ where: { user_id: options.userId, date: { lte: localDate } }, orderBy: [{ date: 'desc' }, { id: 'desc' }] }),
      tx.bodyMetric.findUnique({ where: { user_id_date: { user_id: options.userId, date: localDate } } }),
      tx.foodLog.aggregate({ where: { user_id: options.userId, local_date: localDate }, _sum: { calories: true } }),
      tx.activityDaySummary.findUnique({ where: { user_id_local_date: { user_id: options.userId, local_date: localDate } } }),
      tx.foodLogDay.findUnique({ where: { user_id_local_date: { user_id: options.userId, local_date: localDate } } }),
      tx.myFood.findMany({ where: { user_id: options.userId, is_pinned: true }, orderBy: [{ name: 'asc' }, { id: 'asc' }], take: WATCH_PINNED_LIMIT, select: { id: true, name: true, calories_per_serving: true } }),
      getRecentFoodSuggestions({ userId: options.userId, limit: WATCH_RECENT_LIMIT, database: tx }),
      findCurrentSessionUndoCandidate({ tx, userId: options.userId, mobileAuthSessionId: options.mobileAuthSessionId }),
      activeReminderPromise
    ]);

    const calorieSummary = buildCalorieSummary({
      weight_grams: latestWeight?.weight_grams,
      profile: user,
      daily_deficit: goal?.daily_deficit,
      now
    });
    const caloriesConsumed = foodAggregate._sum.calories ?? 0;
    const calorieTarget = calorieSummary.dailyCalorieTarget === undefined ? null : Math.round(calorieSummary.dailyCalorieTarget);
    const observedAt = activity?.observed_at ?? null;
    const activityAgeSeconds = observedAt
      ? Math.max(0, Math.floor((now.getTime() - observedAt.getTime()) / 60_000) * 60)
      : null;
    const activityStale = !observedAt || now.getTime() - observedAt.getTime() > ACTIVITY_STALE_AFTER_MS;
    const defaultMealPeriod = suggestedMealPeriod(now, user.timezone);
    const recentMyFoodIds = Array.from(new Set(
      recent.map((item) => item.my_food_id).filter((id): id is number => id !== null)
    ));
    const currentRecentMyFoods = recentMyFoodIds.length === 0
      ? []
      : await tx.myFood.findMany({
          where: { user_id: options.userId, id: { in: recentMyFoodIds } },
          select: { id: true, name: true, calories_per_serving: true }
        });
    const currentRecentMyFoodById = new Map(currentRecentMyFoods.map((item) => [item.id, item]));
    const pinnedDrafts = pinned.map((item) => ({
      id: `my-food:${item.id}`,
      source: 'pinned' as const,
      label: item.name,
      calories: Math.round(item.calories_per_serving),
      draft: { meal_period: defaultMealPeriod, my_food_id: item.id, servings_consumed: 1 }
    }));
    const pinnedIds = new Set(pinned.map((item) => item.id));
    const quickAdd = [
      ...pinnedDrafts,
      ...recent
        .filter((item) => !item.my_food_id || !pinnedIds.has(item.my_food_id))
        .map((item) => recentDraft(item, item.my_food_id ? currentRecentMyFoodById.get(item.my_food_id) : undefined))
        .filter((item): item is NonNullable<typeof item> => item !== null)
    ].slice(0, WATCH_QUICK_ADD_LIMIT).map((item) => ({
      ...item,
      // Preserve the snapshot's intended local day when an offline watch submits after midnight.
      draft: { date: localDateKey, ...item.draft }
    }));
    // One current reminder per action prevents dev/scheduler rows from creating duplicate watch notifications.
    const reminderByType = new Map<string, (typeof activeReminderRows)[number]>();
    for (const reminder of activeReminderRows) {
      if (!reminderByType.has(reminder.type)) reminderByType.set(reminder.type, reminder);
    }
    const reminders = [...reminderByType.values()].map((reminder) => ({
      id: reminder.id,
      type: reminder.type === 'LOG_WEIGHT_REMINDER' ? 'weight' as const : 'food' as const,
      local_date: reminder.local_date.toISOString().slice(0, 10),
      created_at: reminder.created_at.toISOString()
    }));

    const semantic = {
      local_date: localDateKey,
      weight_unit: user.weight_unit,
      calories: { consumed: caloriesConsumed, target: calorieTarget, remaining: calorieTarget === null ? null : calorieTarget - caloriesConsumed, missing: calorieSummary.missing },
      activity: activity ? { steps: activity.steps, active_calories_kcal: activity.active_calories_kcal, total_calories_kcal: activity.total_calories_kcal, exercise_minutes: activity.exercise_minutes, observed_at: activity.observed_at.toISOString() } : null,
      food_day: {
        is_complete: foodDay?.is_complete ?? false,
        completed_at: foodDay?.completed_at?.toISOString() ?? null,
        revision: foodDay ? foodDayRevision(foodDay) : null
      },
      weight: {
        today_grams: todayWeight?.weight_grams ?? null,
        today_revision: todayWeight ? metricRevision(todayWeight) : null,
        latest_grams: latestWeight?.weight_grams ?? null,
        latest_revision: latestWeight ? metricRevision(latestWeight) : null,
        latest_date: latestWeight?.date.toISOString().slice(0, 10) ?? null
      },
      quick_add: quickAdd,
      reminders,
      undo_candidate: undoCandidate,
      staleness: { activity_stale: activityStale, activity_age_seconds: activityAgeSeconds }
    };
    const revision = crypto.createHash('sha256')
      .update(JSON.stringify({ timezone: user.timezone, ...semantic }))
      .digest('hex')
      .slice(0, 24);
    return {
      server_time: now.toISOString(),
      timezone: user.timezone,
      revision,
      ...semantic
    };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}

export const watchSnapshotEtag = (revision: string): string => `W/"watch-${revision}"`;
