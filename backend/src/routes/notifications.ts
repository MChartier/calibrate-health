import express from 'express';
import prisma from '../config/database';
import type { Prisma } from '@prisma/client';

type NotificationSettingsPayload = {
  weight_reminder_enabled: boolean;
  food_reminder_enabled: boolean;
  badge_enabled: boolean;
};

const NOTIFICATION_SETTINGS_SELECT = {
  weight_reminder_enabled: true,
  food_reminder_enabled: true,
  badge_enabled: true
} satisfies Prisma.NotificationSettingsSelect;

/**
 * Ensure the session is authenticated before accessing notification settings.
 */
const isAuthenticated = (
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) => {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ message: 'Not authenticated' });
};

/**
 * Build a response payload that matches the client settings shape.
 */
const serializeNotificationSettings = (
  settings: Prisma.NotificationSettingsGetPayload<{ select: typeof NOTIFICATION_SETTINGS_SELECT }>
): NotificationSettingsPayload => ({
  weight_reminder_enabled: settings.weight_reminder_enabled,
  food_reminder_enabled: settings.food_reminder_enabled,
  badge_enabled: settings.badge_enabled
});

/**
 * Load the notification settings row or create it with defaults.
 */
const ensureNotificationSettings = async (userId: number) =>
  (await prisma.notificationSettings.findUnique({
    where: { user_id: userId },
    select: NOTIFICATION_SETTINGS_SELECT
  })) ??
  prisma.notificationSettings.create({
    data: { user_id: userId },
    select: NOTIFICATION_SETTINGS_SELECT
  });

const router = express.Router();

router.use(isAuthenticated);

router.get('/settings', async (req, res) => {
  const user = req.user as any;

  try {
    const settings = await ensureNotificationSettings(user.id);
    res.json({ settings: serializeNotificationSettings(settings) });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.patch('/settings', async (req, res) => {
  const user = req.user as any;
  const body = req.body as Record<string, unknown>;

  const updateData: Partial<NotificationSettingsPayload> = {};

  if (body.weight_reminder_enabled !== undefined) {
    if (typeof body.weight_reminder_enabled !== 'boolean') {
      return res.status(400).json({ message: 'Invalid weight_reminder_enabled' });
    }
    updateData.weight_reminder_enabled = body.weight_reminder_enabled;
  }

  if (body.food_reminder_enabled !== undefined) {
    if (typeof body.food_reminder_enabled !== 'boolean') {
      return res.status(400).json({ message: 'Invalid food_reminder_enabled' });
    }
    updateData.food_reminder_enabled = body.food_reminder_enabled;
  }

  if (body.badge_enabled !== undefined) {
    if (typeof body.badge_enabled !== 'boolean') {
      return res.status(400).json({ message: 'Invalid badge_enabled' });
    }
    updateData.badge_enabled = body.badge_enabled;
  }

  if (Object.keys(updateData).length === 0) {
    return res.status(400).json({ message: 'No fields to update' });
  }

  try {
    const settings = await prisma.notificationSettings.upsert({
      where: { user_id: user.id },
      create: {
        user_id: user.id,
        ...updateData
      },
      update: updateData,
      select: NOTIFICATION_SETTINGS_SELECT
    });

    res.json({ settings: serializeNotificationSettings(settings) });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.get('/vapid-public-key', (_req, res) => {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();

  if (!publicKey) {
    return res.status(404).json({ message: 'Push notifications are not configured' });
  }

  res.json({ publicKey });
});

router.post('/subscriptions', async (req, res) => {
  const user = req.user as any;
  const body = req.body as Record<string, unknown>;

  const endpoint = typeof body.endpoint === 'string' ? body.endpoint.trim() : '';
  const keys = typeof body.keys === 'object' && body.keys ? (body.keys as Record<string, unknown>) : null;
  const p256dh = typeof keys?.p256dh === 'string' ? keys.p256dh.trim() : '';
  const auth = typeof keys?.auth === 'string' ? keys.auth.trim() : '';
  const userAgent = typeof body.user_agent === 'string' ? body.user_agent.trim() : null;

  if (!endpoint || !p256dh || !auth) {
    return res.status(400).json({ message: 'Invalid subscription payload' });
  }

  try {
    await prisma.pushSubscription.upsert({
      where: { endpoint },
      create: {
        user_id: user.id,
        endpoint,
        p256dh,
        auth,
        user_agent: userAgent || null
      },
      update: {
        user_id: user.id,
        p256dh,
        auth,
        user_agent: userAgent || null,
        last_seen_at: new Date()
      }
    });

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

router.delete('/subscriptions', async (req, res) => {
  const user = req.user as any;
  const body = req.body as Record<string, unknown>;
  const endpoint = typeof body.endpoint === 'string' ? body.endpoint.trim() : '';

  if (!endpoint) {
    return res.status(400).json({ message: 'Invalid subscription payload' });
  }

  try {
    await prisma.pushSubscription.deleteMany({
      where: {
        endpoint,
        user_id: user.id
      }
    });

    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
