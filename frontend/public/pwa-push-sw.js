self.addEventListener('push', (event) => {
  const payload = (() => {
    try {
      return event.data ? event.data.json() : {};
    } catch {
      return {};
    }
  })();

  const title = typeof payload.title === 'string' ? payload.title : 'calibrate reminder';
  const body = typeof payload.body === 'string' ? payload.body : '';
  const tag = typeof payload.tag === 'string' ? payload.tag : undefined;
  const url = typeof payload.url === 'string' ? payload.url : '/log';
  const badgeCount = typeof payload.badgeCount === 'number' ? payload.badgeCount : null;
  const actions = Array.isArray(payload.actions)
    ? payload.actions.filter(
        (action) =>
          action &&
          typeof action.action === 'string' &&
          typeof action.title === 'string'
      )
    : [];

  const options = {
    body,
    tag,
    data: { url },
    actions,
    icon: '/pwa-192x192.png',
    badge: '/pwa-192x192.png'
  };

  event.waitUntil(
    (async () => {
      if (typeof self.registration.setAppBadge === 'function') {
        try {
          if (badgeCount && badgeCount > 0) {
            await self.registration.setAppBadge(badgeCount);
          } else if (typeof self.registration.clearAppBadge === 'function') {
            await self.registration.clearAppBadge();
          }
        } catch {
          // Badge updates are best-effort; ignore failures.
        }
      }

      await self.registration.showNotification(title, options);
    })()
  );
});

self.addEventListener('notificationclick', (event) => {
  const action = event.action;
  const fallbackUrl = event.notification?.data?.url || '/log';

  let targetUrl = fallbackUrl;
  if (action === 'log-weight') targetUrl = '/log?quickAdd=weight';
  if (action === 'log-food') targetUrl = '/log?quickAdd=food';

  event.notification.close();

  event.waitUntil(
    (async () => {
      const absoluteUrl = new URL(targetUrl, self.location.origin).href;
      const windowClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });

      for (const client of windowClients) {
        if ('focus' in client) {
          if ('navigate' in client) {
            await client.navigate(absoluteUrl);
          }
          await client.focus();
          return;
        }
      }

      if (self.clients.openWindow) {
        await self.clients.openWindow(absoluteUrl);
      }
    })()
  );
});
