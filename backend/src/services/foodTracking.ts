import prisma from '../config/database';
import {
  addUtcDays,
  formatDateToLocalDateString,
  getSafeUtcTodayDateOnlyInTimeZone,
  parseLocalDateOnly
} from '../utils/date';
import { type MutationDatabase, recordSyncChange } from './clientOperations';

export const FOOD_DAY_STATUSES = ['OPEN', 'COMPLETE', 'INCOMPLETE', 'PAUSED'] as const;
export type FoodDayStatus = (typeof FOOD_DAY_STATUSES)[number];
export type FoodDayOrigin = 'USER' | 'PAUSE' | 'IMPORT';
export type FoodDaySource =
  | 'STORED'
  | 'ACTIVE_PAUSE'
  | 'INFERRED_EMPTY'
  | 'DEFAULT'
  | 'BEFORE_TRACKING_START';

export type FoodDayWire = {
  date: string;
  status: FoodDayStatus;
  origin: FoodDayOrigin | null;
  source: FoodDaySource;
  is_representative: boolean;
  is_complete: boolean;
  completed_at: Date | null;
  updated_at: Date | null;
};

export type FoodTrackingPauseWire = {
  active: boolean;
  id: number | null;
  starts_on: string | null;
  expected_resume_on: string | null;
  resumed_on: string | null;
  started_at: Date | null;
  resumed_at: Date | null;
  materialized_through: string | null;
  resume_confirmation_due: boolean;
};

export function formatDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function isFoodDayStatus(value: unknown): value is FoodDayStatus {
  return typeof value === 'string' && (FOOD_DAY_STATUSES as readonly string[]).includes(value);
}

function serializeStoredDay(day: {
  local_date: Date;
  status: string;
  origin: string;
  completed_at: Date | null;
  updated_at: Date;
}): FoodDayWire {
  const status = day.status as FoodDayStatus;
  return {
    date: formatDateKey(day.local_date),
    status,
    origin: day.origin as FoodDayOrigin,
    source: 'STORED',
    is_representative: status === 'COMPLETE',
    is_complete: status === 'COMPLETE',
    completed_at: day.completed_at,
    updated_at: day.updated_at
  };
}

function serializePause(pause: {
  id: number;
  starts_on: Date;
  expected_resume_on: Date | null;
  resumed_on: Date | null;
  started_at: Date;
  resumed_at: Date | null;
  materialized_through: Date;
}, today: Date): FoodTrackingPauseWire {
  const active = pause.resumed_on === null;
  return {
    active,
    id: pause.id,
    starts_on: formatDateKey(pause.starts_on),
    expected_resume_on: pause.expected_resume_on ? formatDateKey(pause.expected_resume_on) : null,
    resumed_on: pause.resumed_on ? formatDateKey(pause.resumed_on) : null,
    started_at: pause.started_at,
    resumed_at: pause.resumed_at,
    materialized_through: formatDateKey(pause.materialized_through),
    resume_confirmation_due:
      active && pause.expected_resume_on !== null && pause.expected_resume_on.getTime() <= today.getTime()
  };
}

export async function getTrackingStartDate(
  userId: number,
  db: MutationDatabase = prisma
): Promise<{ date: Date; inferenceDate: Date; timezone: string } | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { created_at: true, timezone: true }
  });
  if (!user) return null;

  const [food, metric, day, pause] = await Promise.all([
    db.foodLog.findFirst({
      where: { user_id: userId },
      orderBy: { local_date: 'asc' },
      select: { local_date: true }
    }),
    db.bodyMetric.findFirst({
      where: { user_id: userId },
      orderBy: { date: 'asc' },
      select: { date: true }
    }),
    db.foodLogDay.findFirst({
      where: { user_id: userId },
      orderBy: { local_date: 'asc' },
      select: { local_date: true }
    }),
    db.foodTrackingPause.findFirst({
      where: { user_id: userId },
      orderBy: { starts_on: 'asc' },
      select: { starts_on: true }
    })
  ]);

  const accountDate = parseLocalDateOnly(formatDateToLocalDateString(user.created_at, user.timezone));
  const candidates = [accountDate, food?.local_date, metric?.date, day?.local_date, pause?.starts_on].filter(
    (value): value is Date => value instanceof Date
  );
  return {
    date: candidates.reduce((earliest, candidate) => (candidate < earliest ? candidate : earliest)),
    inferenceDate: accountDate,
    timezone: user.timezone
  };
}

export async function getEffectiveFoodDay(
  userId: number,
  localDate: Date,
  now = new Date(),
  db: MutationDatabase = prisma
): Promise<FoodDayWire | null> {
  const stored = await db.foodLogDay.findUnique({
    where: { user_id_local_date: { user_id: userId, local_date: localDate } }
  });
  if (stored) return serializeStoredDay(stored);
  const trackingStart = await getTrackingStartDate(userId, db);
  if (!trackingStart) return null;

  const coveringPause = await db.foodTrackingPause.findFirst({
    where: {
      user_id: userId,
      starts_on: { lte: localDate },
      OR: [{ resumed_on: null }, { resumed_on: { gt: localDate } }]
    },
    orderBy: { starts_on: 'desc' }
  });
  if (coveringPause) {
    return {
      date: formatDateKey(localDate),
      status: 'PAUSED',
      origin: 'PAUSE',
      source: 'ACTIVE_PAUSE',
      is_representative: false,
      is_complete: false,
      completed_at: null,
      updated_at: coveringPause.updated_at
    };
  }

  const today = getSafeUtcTodayDateOnlyInTimeZone(trackingStart.timezone, now);
  if (localDate < trackingStart.inferenceDate) {
    return {
      date: formatDateKey(localDate),
      status: 'OPEN',
      origin: null,
      source: 'BEFORE_TRACKING_START',
      is_representative: false,
      is_complete: false,
      completed_at: null,
      updated_at: null
    };
  }

  if (localDate < today) {
    const foodCount = await db.foodLog.count({
      where: { user_id: userId, local_date: localDate }
    });
    if (foodCount === 0) {
      return {
        date: formatDateKey(localDate),
        status: 'INCOMPLETE',
        origin: null,
        source: 'INFERRED_EMPTY',
        is_representative: false,
        is_complete: false,
        completed_at: null,
        updated_at: null
      };
    }
  }

  return {
    date: formatDateKey(localDate),
    status: 'OPEN',
    origin: null,
    source: 'DEFAULT',
    is_representative: false,
    is_complete: false,
    completed_at: null,
    updated_at: null
  };
}

export async function getEffectiveFoodDayRange(
  userId: number,
  startDate: Date,
  endDate: Date,
  now = new Date(),
  db: MutationDatabase = prisma
): Promise<FoodDayWire[] | null> {
  const trackingStart = await getTrackingStartDate(userId, db);
  if (!trackingStart) return null;
  const [storedDays, coveringPauses, foodDates] = await Promise.all([
    db.foodLogDay.findMany({
      where: { user_id: userId, local_date: { gte: startDate, lte: endDate } },
      orderBy: { local_date: 'asc' }
    }),
    db.foodTrackingPause.findMany({
      where: {
        user_id: userId,
        starts_on: { lte: endDate },
        OR: [{ resumed_on: null }, { resumed_on: { gt: startDate } }]
      },
      orderBy: { starts_on: 'desc' }
    }),
    db.foodLog.findMany({
      where: { user_id: userId, local_date: { gte: startDate, lte: endDate } },
      select: { local_date: true },
      distinct: ['local_date']
    })
  ]);
  const storedByDate = new Map(storedDays.map((day) => [formatDateKey(day.local_date), day]));
  const foodDateKeys = new Set(foodDates.map((row) => formatDateKey(row.local_date)));
  const today = getSafeUtcTodayDateOnlyInTimeZone(trackingStart.timezone, now);
  const days: FoodDayWire[] = [];
  for (let cursor = startDate; cursor <= endDate; cursor = addUtcDays(cursor, 1)) {
    const dateKey = formatDateKey(cursor);
    const stored = storedByDate.get(dateKey);
    if (stored) {
      days.push(serializeStoredDay(stored));
      continue;
    }
    const pause = coveringPauses.find(
      (candidate) =>
        candidate.starts_on <= cursor &&
        (candidate.resumed_on === null || candidate.resumed_on > cursor)
    );
    if (pause) {
      days.push({
        date: dateKey,
        status: 'PAUSED',
        origin: 'PAUSE',
        source: 'ACTIVE_PAUSE',
        is_representative: false,
        is_complete: false,
        completed_at: null,
        updated_at: pause.updated_at
      });
      continue;
    }
    let source: FoodDaySource = 'DEFAULT';
    let status: FoodDayStatus = 'OPEN';
    if (cursor < trackingStart.inferenceDate) {
      source = 'BEFORE_TRACKING_START';
    } else if (cursor < today && !foodDateKeys.has(dateKey)) {
      source = 'INFERRED_EMPTY';
      status = 'INCOMPLETE';
    }
    days.push({
      date: dateKey,
      status,
      origin: null,
      source,
      is_representative: false,
      is_complete: false,
      completed_at: null,
      updated_at: null
    });
  }
  return days;
}

export async function getActiveFoodTrackingPause(
  userId: number,
  now = new Date(),
  db: MutationDatabase = prisma
): Promise<FoodTrackingPauseWire | null> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: { timezone: true }
  });
  if (!user) return null;
  const today = getSafeUtcTodayDateOnlyInTimeZone(user.timezone, now);
  const pause = await db.foodTrackingPause.findFirst({
    where: { user_id: userId, resumed_on: null },
    orderBy: { started_at: 'desc' }
  });
  if (!pause) {
    return {
      active: false,
      id: null,
      starts_on: null,
      expected_resume_on: null,
      resumed_on: null,
      started_at: null,
      resumed_at: null,
      materialized_through: null,
      resume_confirmation_due: false
    };
  }
  return serializePause(pause, today);
}

async function storePausedDay(
  tx: MutationDatabase,
  userId: number,
  localDate: Date,
  operationId?: string,
  overwrite = false
): Promise<void> {
  const existing = await tx.foodLogDay.findUnique({
    where: { user_id_local_date: { user_id: userId, local_date: localDate } }
  });
  if (existing && !overwrite) return;

  const day = existing
    ? await tx.foodLogDay.update({
        where: { id: existing.id },
        data: { status: 'PAUSED', origin: 'PAUSE', completed_at: null }
      })
    : await tx.foodLogDay.create({
        data: {
          user_id: userId,
          local_date: localDate,
          status: 'PAUSED',
          origin: 'PAUSE'
        }
      });
  const body = serializeStoredDay(day);
  await recordSyncChange({
    tx,
    userId,
    entityType: 'food_log_day',
    entityId: body.date,
    action: 'upsert',
    operationId,
    payload: body
  });
}

export async function materializePauseThrough(options: {
  tx: MutationDatabase;
  pause: {
    id: number;
    user_id: number;
    starts_on: Date;
    materialized_through: Date;
  };
  through: Date;
  operationId?: string;
}): Promise<void> {
  if (options.through < options.pause.starts_on) return;
  let cursor =
    options.pause.materialized_through < options.pause.starts_on
      ? options.pause.starts_on
      : addUtcDays(options.pause.materialized_through, 1);
  while (cursor <= options.through) {
    await storePausedDay(options.tx, options.pause.user_id, cursor, options.operationId);
    cursor = addUtcDays(cursor, 1);
  }
  if (options.through > options.pause.materialized_through) {
    await options.tx.foodTrackingPause.update({
      where: { id: options.pause.id },
      data: { materialized_through: options.through }
    });
  }
}

export async function materializeActiveFoodTrackingPauses(now = new Date()): Promise<void> {
  const pauses = await prisma.foodTrackingPause.findMany({
    where: { resumed_on: null },
    include: { user: { select: { timezone: true } } }
  });
  for (const pause of pauses) {
    const today = getSafeUtcTodayDateOnlyInTimeZone(pause.user.timezone, now);
    await prisma.$transaction(async (tx) => {
      await materializePauseThrough({ tx, pause, through: today });
    });
  }
}

export async function startFoodTrackingPause(options: {
  tx: MutationDatabase;
  userId: number;
  startsOn: Date;
  expectedResumeOn: Date | null;
  now: Date;
  operationId?: string;
}): Promise<FoodTrackingPauseWire> {
  const existing = await options.tx.foodTrackingPause.findFirst({
    where: { user_id: options.userId, resumed_on: null }
  });
  if (existing) {
    throw new Error('ACTIVE_PAUSE_EXISTS');
  }
  await storePausedDay(options.tx, options.userId, options.startsOn, options.operationId, true);
  const pause = await options.tx.foodTrackingPause.create({
    data: {
      user_id: options.userId,
      starts_on: options.startsOn,
      expected_resume_on: options.expectedResumeOn,
      materialized_through: options.startsOn,
      started_at: options.now
    }
  });
  await recordSyncChange({
    tx: options.tx,
    userId: options.userId,
    entityType: 'food_tracking_pause',
    entityId: pause.id,
    action: 'upsert',
    operationId: options.operationId,
    payload: serializePause(pause, options.startsOn)
  });
  return serializePause(pause, options.startsOn);
}

export async function updateFoodTrackingPauseExpectation(options: {
  tx: MutationDatabase;
  userId: number;
  expectedResumeOn: Date | null;
  today: Date;
  operationId?: string;
}): Promise<FoodTrackingPauseWire> {
  const pause = await options.tx.foodTrackingPause.findFirst({
    where: { user_id: options.userId, resumed_on: null }
  });
  if (!pause) throw new Error('NO_ACTIVE_PAUSE');
  if (options.expectedResumeOn !== null && options.expectedResumeOn <= pause.starts_on) {
    throw new Error('INVALID_EXPECTED_RESUME_DATE');
  }
  const updated = await options.tx.foodTrackingPause.update({
    where: { id: pause.id },
    data: { expected_resume_on: options.expectedResumeOn }
  });
  const body = serializePause(updated, options.today);
  await recordSyncChange({
    tx: options.tx,
    userId: options.userId,
    entityType: 'food_tracking_pause',
    entityId: updated.id,
    action: 'upsert',
    operationId: options.operationId,
    payload: body
  });
  return body;
}

export async function resumeFoodTracking(options: {
  tx: MutationDatabase;
  userId: number;
  resumedOn: Date;
  now: Date;
  operationId?: string;
}): Promise<{ pause: FoodTrackingPauseWire; day: FoodDayWire }> {
  const pause = await options.tx.foodTrackingPause.findFirst({
    where: { user_id: options.userId, resumed_on: null }
  });
  if (!pause) throw new Error('NO_ACTIVE_PAUSE');
  if (options.resumedOn < pause.starts_on) throw new Error('INVALID_RESUME_DATE');

  await materializePauseThrough({
    tx: options.tx,
    pause,
    through: addUtcDays(options.resumedOn, -1),
    operationId: options.operationId
  });
  const updatedPause = await options.tx.foodTrackingPause.update({
    where: { id: pause.id },
    data: { resumed_on: options.resumedOn, resumed_at: options.now }
  });
  const resumedDay = await options.tx.foodLogDay.upsert({
    where: { user_id_local_date: { user_id: options.userId, local_date: options.resumedOn } },
    update: { status: 'OPEN', origin: 'USER', completed_at: null },
    create: {
      user_id: options.userId,
      local_date: options.resumedOn,
      status: 'OPEN',
      origin: 'USER'
    }
  });
  const dayBody = serializeStoredDay(resumedDay);
  await recordSyncChange({
    tx: options.tx,
    userId: options.userId,
    entityType: 'food_log_day',
    entityId: dayBody.date,
    action: 'upsert',
    operationId: options.operationId,
    payload: dayBody
  });
  const pauseBody = serializePause(updatedPause, options.resumedOn);
  await recordSyncChange({
    tx: options.tx,
    userId: options.userId,
    entityType: 'food_tracking_pause',
    entityId: updatedPause.id,
    action: 'upsert',
    operationId: options.operationId,
    payload: pauseBody
  });
  return { pause: pauseBody, day: dayBody };
}

export function serializeFoodDayStatus(options: {
  date: Date;
  status: FoodDayStatus;
  origin?: FoodDayOrigin;
  completedAt?: Date | null;
  updatedAt?: Date | null;
}): FoodDayWire {
  return {
    date: formatDateKey(options.date),
    status: options.status,
    origin: options.origin ?? 'USER',
    source: 'STORED',
    is_representative: options.status === 'COMPLETE',
    is_complete: options.status === 'COMPLETE',
    completed_at: options.completedAt ?? null,
    updated_at: options.updatedAt ?? null
  };
}
