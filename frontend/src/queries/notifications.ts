import { useQuery } from '@tanstack/react-query';
import axios from 'axios';

export type NotificationSettings = {
  weight_reminder_enabled: boolean;
  food_reminder_enabled: boolean;
  badge_enabled: boolean;
};

export type PushSubscriptionPayload = {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  user_agent?: string | null;
};

/**
 * Fetch the authenticated user's notification settings.
 */
export async function fetchNotificationSettings(): Promise<NotificationSettings> {
  const res = await axios.get('/api/notifications/settings');
  return res.data.settings as NotificationSettings;
}

/**
 * Patch the user's notification settings.
 */
export async function updateNotificationSettings(
  payload: Partial<NotificationSettings>
): Promise<NotificationSettings> {
  const res = await axios.patch('/api/notifications/settings', payload);
  return res.data.settings as NotificationSettings;
}

/**
 * Fetch the VAPID public key used for web push subscriptions.
 */
export async function fetchVapidPublicKey(): Promise<string> {
  const res = await axios.get('/api/notifications/vapid-public-key');
  return res.data.publicKey as string;
}

/**
 * Register or update a push subscription for the current device.
 */
export async function registerPushSubscription(payload: PushSubscriptionPayload): Promise<void> {
  await axios.post('/api/notifications/subscriptions', payload);
}

/**
 * Remove a push subscription by endpoint for the current user.
 */
export async function unregisterPushSubscription(endpoint: string): Promise<void> {
  await axios.delete('/api/notifications/subscriptions', { data: { endpoint } });
}

/**
 * Shared hook for loading notification settings.
 */
export function useNotificationSettingsQuery(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['notification-settings'],
    queryFn: fetchNotificationSettings,
    enabled: options?.enabled
  });
}
