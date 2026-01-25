/**
 * Helpers for web push and app badge capabilities.
 */

const IOS_STANDALONE_MEDIA_QUERY = '(display-mode: standalone)'; // Media query for installed PWA mode.

/**
 * Return true if the runtime is an iOS device (best-effort).
 */
export function isIosDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

/**
 * Return true if the app is running as an installed PWA.
 */
export function isStandaloneDisplayMode(): boolean {
  if (typeof window === 'undefined') return false;
  const matchMediaResult = window.matchMedia?.(IOS_STANDALONE_MEDIA_QUERY).matches ?? false;
  const legacyStandalone = Boolean((navigator as { standalone?: boolean } | undefined)?.standalone);
  return matchMediaResult || legacyStandalone;
}

/**
 * Return true when the browser exposes the Push API prerequisites.
 */
export function isPushSupported(): boolean {
  if (typeof window === 'undefined') return false;
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

/**
 * Return true when the Badging API is available on this device.
 */
export function isBadgeSupported(): boolean {
  if (typeof navigator === 'undefined') return false;
  return typeof navigator.setAppBadge === 'function';
}

/**
 * Convert a base64-encoded VAPID key into a Uint8Array for PushManager.subscribe.
 */
export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }

  return outputArray;
}

/**
 * Set or clear the app badge count with a safe fallback.
 */
export async function setAppBadgeCount(count: number | null): Promise<void> {
  if (!isBadgeSupported()) return;

  try {
    if (count && count > 0) {
      await navigator.setAppBadge(count);
    } else if (typeof navigator.clearAppBadge === 'function') {
      await navigator.clearAppBadge();
    } else {
      await navigator.setAppBadge(0);
    }
  } catch {
    // Badge API is best-effort; ignore failures silently.
  }
}

export type PushSupportStatus = {
  supported: boolean;
  permission: NotificationPermission;
  isIos: boolean;
  isStandalone: boolean;
  requiresInstall: boolean;
};

/**
 * Collect capability and permission information for push notifications.
 */
export function getPushSupportStatus(): PushSupportStatus {
  const supported = isPushSupported();
  const permission = typeof Notification !== 'undefined' ? Notification.permission : 'default';
  const isIos = isIosDevice();
  const isStandalone = isStandaloneDisplayMode();
  const requiresInstall = Boolean(isIos && !isStandalone);

  return {
    supported,
    permission,
    isIos,
    isStandalone,
    requiresInstall
  };
}
