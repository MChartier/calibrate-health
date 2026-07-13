import express from 'express';
import { NativePushPlatform, NativePushProvider, Prisma } from '@prisma/client';
import prisma from '../config/database';
import {
  listActiveInAppNotificationsForUser,
  markInAppNotificationDismissed,
  markInAppNotificationRead,
  resolveInactiveReminderNotificationsForUser
} from '../services/inAppNotifications';
import { getWebPushPublicKey } from '../services/webPush';
import { parsePositiveInteger } from '../utils/requestParsing';
import { NATIVE_PUSH_PLATFORMS, NATIVE_PUSH_PROVIDERS } from '../../../shared/domain';

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

  await prisma.pushSubscription.upsert({
    where: {
      user_id_endpoint: {
        user_id: user.id,
        endpoint
      }
    },
    update: {
      p256dh,
      auth,
      expiration_time: expirationTime
    },
    create: {
      user_id: user.id,
      endpoint,
      p256dh,
      auth,
      expiration_time: expirationTime
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

  try {
    await prisma.pushSubscription.delete({
      where: {
        user_id_endpoint: {
          user_id: user.id,
          endpoint
        }
      }
    });
  } catch (error) {
    // Treat repeated unsubscribe calls as success so this endpoint stays idempotent.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2025'
    ) {
      return res.json({ ok: true });
    }
    throw error;
  }

  res.json({ ok: true });
});

const parseNativePushPlatform = (value: unknown): NativePushPlatform | null => {
  if (value === undefined || value === null || value === NATIVE_PUSH_PLATFORMS.ANDROID) {
    return NativePushPlatform.ANDROID;
  }
  return null;
};

const parseNativePushProvider = (value: unknown): NativePushProvider | null => {
  if (value === undefined || value === null || value === NATIVE_PUSH_PROVIDERS.EXPO) {
    return NativePushProvider.EXPO;
  }
  return null;
};

const normalizeNativeText = (value: unknown, maxLength: number): string => {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  return trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed;
};

const isExpoPushToken = (token: string): boolean =>
  /^(?:Exponent|Expo)PushToken\[[^\[\]]+\]$/.test(token);

router.post('/native-subscription', async (req, res) => {
  const user = req.user as { id: number };
  const token = normalizeNativeText(req.body?.token, 512);
  const mobileAuthSessionId = res.locals.mobileAuthSessionId as number | undefined;
  const deviceId = res.locals.mobileDeviceId as string | undefined;
  const platform = parseNativePushPlatform(req.body?.platform);
  const provider = parseNativePushProvider(req.body?.provider);

  if (!mobileAuthSessionId || !deviceId) {
    return res.status(401).json({ message: 'Mobile authentication required.' });
  }
  if (!token) {
    return res.status(400).json({ message: 'token is required.' });
  }
  if (!platform) {
    return res.status(400).json({ message: 'Invalid native push platform.' });
  }
  if (!provider) {
    return res.status(400).json({ message: 'Invalid or unsupported native push provider.' });
  }
  if (provider === NativePushProvider.EXPO && !isExpoPushToken(token)) {
    return res.status(400).json({ message: 'Invalid Expo push token.' });
  }

  await prisma.nativePushSubscription.upsert({
    where: {
      provider_token: {
        provider,
        token
      }
    },
    update: {
      user_id: user.id,
      mobile_auth_session_id: mobileAuthSessionId,
      device_id: deviceId,
      platform,
      last_sent_local_date: null,
      revoked_at: null
    },
    create: {
      user_id: user.id,
      mobile_auth_session_id: mobileAuthSessionId,
      device_id: deviceId,
      platform,
      provider,
      token
    }
  });

  res.json({ ok: true });
});

router.delete('/native-subscription', async (req, res) => {
  const user = req.user as { id: number };
  const token = normalizeNativeText(req.body?.token, 512);
  const mobileAuthSessionId = res.locals.mobileAuthSessionId as number | undefined;
  const provider = parseNativePushProvider(req.body?.provider);

  if (!mobileAuthSessionId) {
    return res.status(401).json({ message: 'Mobile authentication required.' });
  }
  if (!provider) {
    return res.status(400).json({ message: 'Invalid or unsupported native push provider.' });
  }

  await prisma.nativePushSubscription.updateMany({
    where: {
      user_id: user.id,
      mobile_auth_session_id: mobileAuthSessionId,
      provider,
      ...(token ? { token } : {}),
      revoked_at: null
    },
    data: {
      revoked_at: new Date()
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
