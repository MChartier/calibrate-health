import express from 'express';
import prisma from '../config/database';
import {
  listActiveInAppNotificationsForUser,
  markInAppNotificationDismissed,
  markInAppNotificationRead,
  resolveInactiveReminderNotificationsForUser
} from '../services/inAppNotifications';
import { getWebPushPublicKey } from '../services/webPush';
import { parsePositiveInteger } from '../utils/requestParsing';

/**
 * Push notification subscription endpoints plus in-app reminder feed endpoints.
 */
const router = express.Router();

/**
 * Ensure the session is authenticated before accessing notification settings.
 */
const isAuthenticated = (req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (req.isAuthenticated()) {
    return next();
  }
  res.status(401).json({ message: 'Not authenticated' });
};

router.use(isAuthenticated);

router.get('/public-key', (_req, res) => {
  const { publicKey, error } = getWebPushPublicKey();
  if (!publicKey) {
    return res.status(500).json({ message: error ?? 'Web push is not configured.' });
  }

  res.json({ publicKey });
});

router.post('/subscription', async (req, res) => {
  const user = req.user as { id: number };
  const endpoint = typeof req.body?.endpoint === 'string' ? req.body.endpoint.trim() : '';
  const keys = req.body?.keys as { p256dh?: unknown; auth?: unknown } | undefined;
  const p256dh = typeof keys?.p256dh === 'string' ? keys?.p256dh.trim() : '';
  const auth = typeof keys?.auth === 'string' ? keys?.auth.trim() : '';
  const expirationTimeRaw = req.body?.expirationTime;
  const expirationTime =
    typeof expirationTimeRaw === 'number' && Number.isFinite(expirationTimeRaw)
      ? new Date(expirationTimeRaw)
      : null;

  if (!endpoint || !p256dh || !auth) {
    return res.status(400).json({ message: 'Invalid subscription payload.' });
  }

  const existingSubscription = await prisma.pushSubscription.findUnique({
    where: { endpoint },
    select: { user_id: true }
  });
  const endpointOwnerChanged = existingSubscription?.user_id !== undefined && existingSubscription.user_id !== user.id;

  await prisma.pushSubscription.upsert({
    where: { endpoint },
    update: {
      user_id: user.id,
      p256dh,
      auth,
      expiration_time: expirationTime,
      // Reset local-day dedupe when ownership changes so old-account send state does not bleed to the new owner.
      ...(endpointOwnerChanged ? { last_sent_local_date: null } : {})
    },
    create: {
      user_id: user.id,
      endpoint,
      p256dh,
      auth,
      expiration_time: expirationTime,
      last_sent_local_date: null
    }
  });

  res.json({ ok: true });
});

router.delete('/subscription', async (req, res) => {
  const user = req.user as { id: number };
  const endpoint = typeof req.body?.endpoint === 'string' ? req.body.endpoint.trim() : '';

  if (!endpoint) {
    return res.status(400).json({ message: 'Endpoint is required.' });
  }

  // Delete only rows owned by this user so repeated unsubscribe calls stay idempotent.
  await prisma.pushSubscription.deleteMany({
    where: {
      user_id: user.id,
      endpoint
    }
  });

  res.json({ ok: true });
});

/**
 * Return active in-app reminders, resolving stale/completed entries first.
 */
router.get('/in-app', async (req, res) => {
  const user = req.user as { id: number; timezone?: string };
  const timeZone = user.timezone || 'UTC';

  await resolveInactiveReminderNotificationsForUser({
    userId: user.id,
    timeZone
  });

  const { notifications, unreadCount } = await listActiveInAppNotificationsForUser({ userId: user.id });
  res.json({ notifications, unread_count: unreadCount });
});

router.patch('/in-app/:notificationId/read', async (req, res) => {
  const user = req.user as { id: number };
  const notificationId = parsePositiveInteger(req.params.notificationId);
  if (!notificationId) {
    return res.status(400).json({ message: 'Invalid notification id.' });
  }

  await markInAppNotificationRead({
    userId: user.id,
    notificationId
  });

  res.json({ ok: true });
});

router.patch('/in-app/:notificationId/dismiss', async (req, res) => {
  const user = req.user as { id: number };
  const notificationId = parsePositiveInteger(req.params.notificationId);
  if (!notificationId) {
    return res.status(400).json({ message: 'Invalid notification id.' });
  }

  await markInAppNotificationDismissed({
    userId: user.id,
    notificationId
  });

  res.json({ ok: true });
});

export default router;
