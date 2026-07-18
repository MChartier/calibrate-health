const CACHE_PREFIX = 'calibrate-expo-web-';
const CACHE_NAME = `${CACHE_PREFIX}shell-v1`;
const APP_SHELL = ['/', '/manifest.webmanifest', '/calibrate-icon.svg'];
const DEFAULT_NOTIFICATION_TITLE = 'calibrate';
const DEFAULT_NOTIFICATION_BODY = 'You have a new reminder.';
const DEFAULT_NOTIFICATION_PATH = '/';
const PUSH_SUBSCRIPTION_CHANGED_MESSAGE = 'CALIBRATE_PUSH_SUBSCRIPTION_CHANGED';

function isBackendPath(pathname) {
  return /^\/(?:api|auth)(?:\/|$)/.test(pathname);
}

function resolveSafeNotificationUrl(value) {
  if (typeof value !== 'string' || value.includes('\\') || value.startsWith('//')) {
    return new URL(DEFAULT_NOTIFICATION_PATH, self.location.origin).href;
  }
  try {
    const url = new URL(value, self.location.origin);
    return url.origin === self.location.origin
      ? url.href
      : new URL(DEFAULT_NOTIFICATION_PATH, self.location.origin).href;
  } catch {
    return new URL(DEFAULT_NOTIFICATION_PATH, self.location.origin).href;
  }
}

function parsePushPayload(event) {
  if (!event.data) return {};
  try {
    const payload = event.data.json();
    return payload && typeof payload === 'object' ? payload : {};
  } catch {
    try {
      return { body: event.data.text() };
    } catch {
      return {};
    }
  }
}

async function notifyWindowClients(message) {
  const windowClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  windowClients.forEach((client) => client.postMessage(message));
}

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys
        .filter((key) => key.startsWith(CACHE_PREFIX) && key !== CACHE_NAME)
        .map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') event.waitUntil(self.skipWaiting());
});

self.addEventListener('push', (event) => {
  const payload = parsePushPayload(event);
  const title = typeof payload.title === 'string' && payload.title.trim()
    ? payload.title.trim()
    : DEFAULT_NOTIFICATION_TITLE;
  const body = typeof payload.body === 'string' && payload.body.trim()
    ? payload.body.trim()
    : DEFAULT_NOTIFICATION_BODY;
  const options = {
    body,
    icon: '/calibrate-icon.svg',
    badge: '/calibrate-icon.svg',
    data: {
      ...(payload.data && typeof payload.data === 'object' ? payload.data : {}),
      url: typeof payload.url === 'string' ? payload.url : DEFAULT_NOTIFICATION_PATH,
      actionUrls: payload.actionUrls && typeof payload.actionUrls === 'object' ? payload.actionUrls : {}
    }
  };
  if (typeof payload.tag === 'string' && payload.tag.trim()) options.tag = payload.tag.trim();
  if (Array.isArray(payload.actions)) {
    options.actions = payload.actions.filter((action) => (
      action
      && typeof action.action === 'string'
      && typeof action.title === 'string'
      && action.action.trim()
      && action.title.trim()
    ));
  }
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const data = event.notification.data && typeof event.notification.data === 'object'
    ? event.notification.data
    : {};
  const actionUrl = event.action && data.actionUrls && typeof data.actionUrls === 'object'
    ? data.actionUrls[event.action]
    : undefined;
  const targetUrl = resolveSafeNotificationUrl(actionUrl || data.url);

  event.waitUntil((async () => {
    const windowClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windowClients) {
      if (!('focus' in client)) continue;
      if ('navigate' in client && client.url !== targetUrl) {
        try {
          await client.navigate(targetUrl);
        } catch {
          // Focusing the existing Calibrate window is still a safe recovery path.
        }
      }
      await client.focus();
      return;
    }
    await self.clients.openWindow(targetUrl);
  })());
});

self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil((async () => {
    if (!event.newSubscription && event.oldSubscription?.options) {
      try {
        await self.registration.pushManager.subscribe(event.oldSubscription.options);
      } catch {
        // The open app will surface a user-initiated registration recovery action.
      }
    }
    await notifyWindowClients({
      type: PUSH_SUBSCRIPTION_CHANGED_MESSAGE,
      oldEndpoint: event.oldSubscription?.endpoint
    });
  })());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin || isBackendPath(url.pathname)) return;

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(async () => {
      const cache = await caches.open(CACHE_NAME);
      return (await cache.match(request, { ignoreSearch: true }))
        ?? (await cache.match('/', { ignoreSearch: true }))
        ?? Response.error();
    }));
    return;
  }

  event.respondWith(caches.match(request, { ignoreSearch: true }).then(async (cached) => {
    const networkRequest = fetch(request).then(async (response) => {
      if (response.ok) {
        const cache = await caches.open(CACHE_NAME);
        await cache.put(request, response.clone());
      }
      return response;
    });
    if (!cached) return networkRequest;
    event.waitUntil(networkRequest.catch(() => undefined));
    return cached;
  }));
});
