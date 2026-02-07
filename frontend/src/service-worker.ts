/// <reference lib="webworker" />

import { clientsClaim } from 'workbox-core';
import { cleanupOutdatedCaches, precacheAndRoute, createHandlerBoundToURL, getCacheKeyForURL } from 'workbox-precaching';
import { registerRoute, NavigationRoute } from 'workbox-routing';

declare const self: ServiceWorkerGlobalScope & {
  __WB_MANIFEST: Array<{
    url: string;
    revision: string | null;
  }>;
};

const DEFAULT_NOTIFICATION_TITLE = 'calibrate';
const DEFAULT_NOTIFICATION_BODY = 'You have a new reminder.';
const DEFAULT_NOTIFICATION_URL = '/';
const SPA_ENTRY_URL = '/index.html';

const NAVIGATION_DENYLIST = [/^\/api\//, /^\/auth\//, /^\/dev\/test\//];

/**
 * Ensure new service worker versions take control quickly.
 */
self.skipWaiting();
clientsClaim();

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);

/**
 * Support SPA navigation without intercepting API or auth endpoints.
 */
if (getCacheKeyForURL(SPA_ENTRY_URL)) {
  const navigationHandler = createHandlerBoundToURL(SPA_ENTRY_URL);
  const navigationRoute = new NavigationRoute(navigationHandler, { denylist: NAVIGATION_DENYLIST });
  registerRoute(navigationRoute);
}

type PushPayload = {
  title?: string;
  body?: string;
  url?: string;
  tag?: string;
  actions?: PushNotificationAction[];
  actionUrls?: Record<string, string>;
  data?: Record<string, unknown>;
};

type PushNotificationAction = {
  action: string;
  title: string;
  icon?: string;
};

type NotificationOptionsWithActions = NotificationOptions & {
  actions?: PushNotificationAction[];
};

/**
 * Parse a push payload safely, falling back to defaults if JSON is malformed.
 */
const parsePushPayload = (event: PushEvent): PushPayload => {
  if (!event.data) return {};

  try {
    return event.data.json() as PushPayload;
  } catch {
    try {
      const text = event.data.text();
      return { body: text };
    } catch {
      return {};
    }
  }
};

self.addEventListener('push', (event) => {
  const payload = parsePushPayload(event);
  const title = payload.title?.trim() || DEFAULT_NOTIFICATION_TITLE;
  const body = payload.body?.trim() || DEFAULT_NOTIFICATION_BODY;
  const url = payload.url?.trim() || DEFAULT_NOTIFICATION_URL;

  const options: NotificationOptionsWithActions = {
    body,
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png',
    data: {
      url,
      actionUrls: payload.actionUrls,
      ...(payload.data ?? {})
    }
  };

  if (payload.tag) {
    options.tag = payload.tag;
  }

  if (payload.actions && payload.actions.length > 0) {
    options.actions = payload.actions;
  }

  event.waitUntil(self.registration.showNotification(title, options));
});

/**
 * Focus the app (or open a new window) when a notification is clicked.
 */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  const data = event.notification.data as
    | {
        url?: string;
        actionUrls?: Record<string, string>;
      }
    | undefined;
  const actionUrl = event.action ? data?.actionUrls?.[event.action] : undefined;
  const rawUrl = actionUrl || data?.url || DEFAULT_NOTIFICATION_URL;
  const targetUrl = new URL(rawUrl, self.location.origin).href;

  event.waitUntil(
    (async () => {
      const windowClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of windowClients) {
        if ('focus' in client) {
          if ('navigate' in client && client.url !== targetUrl) {
            try {
              await client.navigate(targetUrl);
            } catch {
              // Navigation failures are non-fatal; focusing the client is still useful.
            }
          }
          await client.focus();
          return;
        }
      }

      await self.clients.openWindow(targetUrl);
    })()
  );
});
