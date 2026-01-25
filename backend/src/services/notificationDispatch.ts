import prisma from '../config/database';
import { getSafeUtcTodayDateOnlyInTimeZone } from '../utils/date';

const webpush = require('web-push');

type ReminderKind = 'weight' | 'food';

type PushAction = {
  action: string;
  title: string;
};

type PushPayload = {
  title: string;
  body: string;
  url: string;
  tag: string;
  actions: PushAction[];
  badgeCount?: number;
};

type SubscriptionRow = {
  endpoint: string;
  p256dh: string;
  auth: string;
};

type NotificationSettingsRow = {
  weight_reminder_enabled: boolean;
  food_reminder_enabled: boolean;
  badge_enabled: boolean;
  last_weight_reminder_date: Date | null;
  last_food_reminder_date: Date | null;
};

const WEIGHT_REMINDER_LOCAL_MINUTES = 9 * 60; // Local time (09:00) for weigh-in reminder.
const FOOD_REMINDER_LOCAL_MINUTES = 20 * 60; // Local time (20:00) for end-of-day meal reminder.
const REMINDER_WINDOW_MINUTES = 60; // Allow this many minutes after the target time for cron runs.

const REMINDER_ACTIONS: PushAction[] = [
  { action: 'log-weight', title: 'Log weight' },
  { action: 'log-food', title: 'Log food' }
];

/**
 * Configure web-push using VAPID details from the environment.
 */
function configureWebPush(): boolean {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.VAPID_SUBJECT?.trim() || 'mailto:admin@example.com';

  if (!publicKey || !privateKey) {
    console.warn(
      'Push reminders are disabled: set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY to send notifications.'
    );
    return false;
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);
  return true;
}

/**
 * Resolve the local clock minutes (00:00-23:59) for a user time zone.
 */
function getLocalTimeMinutes(now: Date, timeZone: string): number {
  const resolved = timeZone && timeZone.trim().length > 0 ? timeZone.trim() : 'UTC';

  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: resolved,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).formatToParts(now);

    const hour = Number(parts.find((part) => part.type === 'hour')?.value);
    const minute = Number(parts.find((part) => part.type === 'minute')?.value);

    if (!Number.isFinite(hour) || !Number.isFinite(minute)) {
      throw new Error('Invalid local time parts');
    }

    return hour * 60 + minute;
  } catch {
    return now.getUTCHours() * 60 + now.getUTCMinutes();
  }
}

/**
 * Return true when the local clock is within the reminder window.
 */
function isWithinReminderWindow(localMinutes: number, targetMinutes: number): boolean {
  return localMinutes >= targetMinutes && localMinutes < targetMinutes + REMINDER_WINDOW_MINUTES;
}

/**
 * Normalize a date-only comparison for reminder de-duping.
 */
function isSameDate(a: Date | null, b: Date): boolean {
  if (!a) return false;
  return a.getTime() === b.getTime();
}

/**
 * Build the push payload for a reminder kind.
 */
function buildReminderPayload(
  kind: ReminderKind,
  localDateIso: string,
  badgeCount: number | null
): PushPayload {
  if (kind === 'weight') {
    return {
      title: 'Log your weight',
      body: 'A quick weigh-in keeps your trend line on track.',
      url: '/log?quickAdd=weight',
      tag: `reminder-weight-${localDateIso}`,
      actions: REMINDER_ACTIONS,
      ...(badgeCount !== null ? { badgeCount } : {})
    };
  }

  return {
    title: "Log today's meals",
    body: 'Add your food so your calorie target stays accurate.',
    url: '/log?quickAdd=food',
    tag: `reminder-food-${localDateIso}`,
    actions: REMINDER_ACTIONS,
    ...(badgeCount !== null ? { badgeCount } : {})
  };
}

/**
 * Send a push payload to every active subscription, pruning stale endpoints.
 */
async function sendToSubscriptions(
  subscriptions: SubscriptionRow[],
  payload: PushPayload
): Promise<{ sentCount: number; staleEndpoints: string[] }> {
  const staleEndpoints: string[] = [];
  let sentCount = 0;

  const results = await Promise.allSettled(
    subscriptions.map((subscription) =>
      webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth }
        },
        JSON.stringify(payload)
      )
    )
  );

  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      sentCount += 1;
      return;
    }

    const error = result.reason as { statusCode?: number };
    const statusCode = error?.statusCode;
    if (statusCode === 404 || statusCode === 410) {
      staleEndpoints.push(subscriptions[index].endpoint);
    } else {
      console.warn('Push send failed for subscription:', subscriptions[index].endpoint);
    }
  });

  return { sentCount, staleEndpoints };
}

/**
 * Dispatch reminder notifications for users with opted-in settings and active subscriptions.
 */
export async function dispatchReminderNotifications(now: Date = new Date()): Promise<void> {
  if (!configureWebPush()) return;

  const users = await prisma.user.findMany({
    where: {
      push_subscriptions: { some: {} },
      notification_settings: {
        is: {
          OR: [{ weight_reminder_enabled: true }, { food_reminder_enabled: true }]
        }
      }
    },
    select: {
      id: true,
      timezone: true,
      notification_settings: {
        select: {
          weight_reminder_enabled: true,
          food_reminder_enabled: true,
          badge_enabled: true,
          last_weight_reminder_date: true,
          last_food_reminder_date: true
        }
      },
      push_subscriptions: {
        select: { endpoint: true, p256dh: true, auth: true }
      }
    }
  });

  for (const user of users) {
    const settings = user.notification_settings as NotificationSettingsRow | null;
    if (!settings) continue;

    const localDate = getSafeUtcTodayDateOnlyInTimeZone(user.timezone, now);
    const localDateIso = localDate.toISOString().slice(0, 10);
    const localMinutes = getLocalTimeMinutes(now, user.timezone);

    const shouldCheckWeight =
      settings.weight_reminder_enabled &&
      !isSameDate(settings.last_weight_reminder_date, localDate) &&
      isWithinReminderWindow(localMinutes, WEIGHT_REMINDER_LOCAL_MINUTES);
    const shouldCheckFood =
      settings.food_reminder_enabled &&
      !isSameDate(settings.last_food_reminder_date, localDate) &&
      isWithinReminderWindow(localMinutes, FOOD_REMINDER_LOCAL_MINUTES);
    const needsWeight = settings.weight_reminder_enabled && (shouldCheckWeight || settings.badge_enabled);
    const needsFood = settings.food_reminder_enabled && (shouldCheckFood || settings.badge_enabled);

    if (!needsWeight && !needsFood) {
      continue;
    }

    let hasWeight = false;
    let hasFood = false;

    if (needsWeight) {
      const existing = await prisma.bodyMetric.findUnique({
        where: { user_id_date: { user_id: user.id, date: localDate } },
        select: { id: true }
      });
      hasWeight = Boolean(existing);
    }

    if (needsFood) {
      const foodCount = await prisma.foodLog.count({
        where: { user_id: user.id, local_date: localDate }
      });
      hasFood = foodCount > 0;
    }

    const missingWeight = settings.weight_reminder_enabled && !hasWeight;
    const missingFood = settings.food_reminder_enabled && !hasFood;
    const badgeCount = settings.badge_enabled ? Number(missingWeight) + Number(missingFood) : null;

    const updateData: { last_weight_reminder_date?: Date; last_food_reminder_date?: Date } = {};

    if (missingWeight && shouldCheckWeight) {
      const payload = buildReminderPayload('weight', localDateIso, badgeCount);
      const result = await sendToSubscriptions(user.push_subscriptions, payload);
      if (result.staleEndpoints.length > 0) {
        await prisma.pushSubscription.deleteMany({
          where: { endpoint: { in: result.staleEndpoints } }
        });
      }
      if (result.sentCount > 0) {
        updateData.last_weight_reminder_date = localDate;
      }
    }

    if (missingFood && shouldCheckFood) {
      const payload = buildReminderPayload('food', localDateIso, badgeCount);
      const result = await sendToSubscriptions(user.push_subscriptions, payload);
      if (result.staleEndpoints.length > 0) {
        await prisma.pushSubscription.deleteMany({
          where: { endpoint: { in: result.staleEndpoints } }
        });
      }
      if (result.sentCount > 0) {
        updateData.last_food_reminder_date = localDate;
      }
    }

    if (Object.keys(updateData).length > 0) {
      await prisma.notificationSettings.update({
        where: { user_id: user.id },
        data: updateData
      });
    }
  }
}
