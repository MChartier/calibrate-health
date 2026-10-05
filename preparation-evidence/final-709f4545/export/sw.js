const SHELL_CACHE_PREFIX = 'calibrate-expo-web-shell-';
const USER_CACHE_PREFIX = 'calibrate-expo-web-user-';
const CACHE_NAME = SHELL_CACHE_PREFIX + '9fd1218b6a79';
const APP_SHELL = [
  "/index.html",
  "/(auth)/login.html",
  "/(auth)/register.html",
  "/(progress)/goals.html",
  "/(progress)/plan-check.html",
  "/(progress)/progress.html",
  "/(progress)/weight-trend.html",
  "/(progress)/weight.html",
  "/(settings)/about.html",
  "/(settings)/activity.html",
  "/(settings)/advanced.html",
  "/(settings)/connected-apps.html",
  "/(settings)/connections.html",
  "/(settings)/data.html",
  "/(settings)/devices.html",
  "/(settings)/health-connect.html",
  "/(settings)/help.html",
  "/(settings)/my-foods.html",
  "/(settings)/preferences.html",
  "/(settings)/profile-details.html",
  "/(settings)/profile.html",
  "/(settings)/security.html",
  "/(settings)/server-admin.html",
  "/(settings)/settings.html",
  "/(settings)/watch.html",
  "/(tabs)/(progress)/goals.html",
  "/(tabs)/(progress)/plan-check.html",
  "/(tabs)/(progress)/progress.html",
  "/(tabs)/(progress)/weight-trend.html",
  "/(tabs)/(progress)/weight.html",
  "/(tabs)/(settings)/about.html",
  "/(tabs)/(settings)/activity.html",
  "/(tabs)/(settings)/advanced.html",
  "/(tabs)/(settings)/connected-apps.html",
  "/(tabs)/(settings)/connections.html",
  "/(tabs)/(settings)/data.html",
  "/(tabs)/(settings)/devices.html",
  "/(tabs)/(settings)/health-connect.html",
  "/(tabs)/(settings)/help.html",
  "/(tabs)/(settings)/my-foods.html",
  "/(tabs)/(settings)/preferences.html",
  "/(tabs)/(settings)/profile-details.html",
  "/(tabs)/(settings)/profile.html",
  "/(tabs)/(settings)/security.html",
  "/(tabs)/(settings)/server-admin.html",
  "/(tabs)/(settings)/settings.html",
  "/(tabs)/(settings)/watch.html",
  "/(tabs)/(today)/food-log.html",
  "/(tabs)/(today)/log.html",
  "/(tabs)/(today)/notifications.html",
  "/(tabs)/(today)/today.html",
  "/(tabs)/about.html",
  "/(tabs)/activity.html",
  "/(tabs)/advanced.html",
  "/(tabs)/connected-apps.html",
  "/(tabs)/connections.html",
  "/(tabs)/data.html",
  "/(tabs)/devices.html",
  "/(tabs)/food-log.html",
  "/(tabs)/goals.html",
  "/(tabs)/health-connect.html",
  "/(tabs)/help.html",
  "/(tabs)/log.html",
  "/(tabs)/my-foods.html",
  "/(tabs)/notifications.html",
  "/(tabs)/plan-check.html",
  "/(tabs)/preferences.html",
  "/(tabs)/profile-details.html",
  "/(tabs)/profile.html",
  "/(tabs)/progress.html",
  "/(tabs)/security.html",
  "/(tabs)/server-admin.html",
  "/(tabs)/settings.html",
  "/(tabs)/today.html",
  "/(tabs)/watch.html",
  "/(tabs)/weight-trend.html",
  "/(tabs)/weight.html",
  "/(today)/food-log.html",
  "/(today)/log.html",
  "/(today)/notifications.html",
  "/(today)/today.html",
  "/+not-found.html",
  "/_expo/static/js/web/ImagePicker-69c097ba915c87e5aa151e6ae9d24a89.js",
  "/_expo/static/js/web/ProgressExpansionContent-a725ce0fb500e6443ae6c149a9b92064.js",
  "/_expo/static/js/web/index-364e0ceff22ecb23f0019d8214a310d5.js",
  "/_expo/static/js/web/index-7c3f6f883199f97753d607fa3fd33e32.js",
  "/_expo/static/js/web/index-87ad6adf0b4d9d29cdf0aa0a7ef76070.js",
  "/_expo/static/js/web/index-92d71452988736d7f029379777be3632.js",
  "/_sitemap.html",
  "/about.html",
  "/account-deletion.html",
  "/activity.html",
  "/advanced.html",
  "/assets/_node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/AntDesign.3f78af31cca60105799838a1a7a59fbd.ttf",
  "/assets/_node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/Entypo.31b5ffea3daddc69dd01a1f3d6cf63c5.ttf",
  "/assets/_node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/EvilIcons.140c53a7643ea949007aa9a282153849.ttf",
  "/assets/_node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/Feather.ca4b48e04dc1ce10bfbddb262c8b835f.ttf",
  "/assets/_node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/FontAwesome.b06871f281fee6b241d60582ae9369b9.ttf",
  "/assets/_node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/FontAwesome5_Brands.3b89dd103490708d19a95adcae52210e.ttf",
  "/assets/_node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/FontAwesome5_Regular.1f77739ca9ff2188b539c36f30ffa2be.ttf",
  "/assets/_node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/FontAwesome5_Solid.605ed7926cf39a2ad5ec2d1f9d391d3d.ttf",
  "/assets/_node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/FontAwesome6_Brands.56c8d80832e37783f12c05db7c8849e2.ttf",
  "/assets/_node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/FontAwesome6_Regular.370dd5af19f8364907b6e2c41f45dbbf.ttf",
  "/assets/_node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/FontAwesome6_Solid.adec7d6f310bc577f05e8fe06a5daccf.ttf",
  "/assets/_node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/Fontisto.b49ae8ab2dbccb02c4d11caaacf09eab.ttf",
  "/assets/_node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/Foundation.e20945d7c929279ef7a6f1db184a4470.ttf",
  "/assets/_node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/Ionicons.b4eb097d35f44ed943676fd56f6bdc51.ttf",
  "/assets/_node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/MaterialCommunityIcons.6e435534bd35da5fef04168860a9b8fa.ttf",
  "/assets/_node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/MaterialIcons.4e85bc9ebe07e0340c9c4fc2f6c38908.ttf",
  "/assets/_node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/Octicons.871378c6eab492a3e689a9385dc45a12.ttf",
  "/assets/_node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/SimpleLineIcons.d2285965fe34b05465047401b8595dd0.ttf",
  "/assets/_node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts/Zocial.1681f34aaca71b8dfb70756bca331eb2.ttf",
  "/assets/node_modules/expo-router/assets/arrow_down.017bc6ba3fc25503e5eb5e53826d48a8.png",
  "/assets/node_modules/expo-router/assets/error.d1ea1496f9057eb392d5bbf3732a61b7.png",
  "/assets/node_modules/expo-router/assets/file.19eeb73b9593a38f8e9f418337fc7d10.png",
  "/assets/node_modules/expo-router/assets/forward.d8b800c443b8972542883e0b9de2bdc6.png",
  "/assets/node_modules/expo-router/assets/pkg.ab19f4cbc543357183a20571f68380a3.png",
  "/assets/node_modules/expo-router/assets/react-navigation/elements/back-icon-mask.0a328cd9c1afd0afe8e3b1ec5165b1b4.png",
  "/assets/node_modules/expo-router/assets/react-navigation/elements/back-icon.35ba0eaec5a4f5ed12ca16fabeae451d.png",
  "/assets/node_modules/expo-router/assets/react-navigation/elements/clear-icon.c94f6478e7ae0cdd9f15de1fcb9e5e55.png",
  "/assets/node_modules/expo-router/assets/react-navigation/elements/close-icon.808e1b1b9b53114ec2838071a7e6daa7.png",
  "/assets/node_modules/expo-router/assets/react-navigation/elements/search-icon.286d67d3f74808a60a78d3ebf1a5fb57.png",
  "/assets/node_modules/expo-router/assets/sitemap.412dd9275b6b48ad28f5e3d81bb1f626.png",
  "/assets/node_modules/expo-router/assets/unmatched.20e71bdf79e3a97bf55fd9e164041578.png",
  "/barcode.html",
  "/calibrate-icon-192.png",
  "/calibrate-icon-512.png",
  "/calibrate-icon-maskable-512.png",
  "/calibrate-icon.svg",
  "/connected-apps.html",
  "/connections.html",
  "/data.html",
  "/devices.html",
  "/food-log.html",
  "/forgot-password.html",
  "/goals.html",
  "/health-connect-privacy.html",
  "/health-connect.html",
  "/help.html",
  "/legal-update.html",
  "/log.html",
  "/login.html",
  "/manifest.webmanifest",
  "/my-foods.html",
  "/notifications.html",
  "/nutrition-label.html",
  "/onboarding.html",
  "/plan-check.html",
  "/preferences.html",
  "/privacy.html",
  "/profile-details.html",
  "/profile.html",
  "/progress.html",
  "/register.html",
  "/reset-password.html",
  "/security.html",
  "/server-admin.html",
  "/settings.html",
  "/support.html",
  "/terms.html",
  "/today.html",
  "/verify-email.html",
  "/watch.html",
  "/weight-trend.html",
  "/weight.html"
];
const DEFAULT_NOTIFICATION_TITLE = 'calibrate';
const DEFAULT_NOTIFICATION_BODY = 'You have a new reminder.';
const DEFAULT_NOTIFICATION_PATH = '/';
const PUSH_SUBSCRIPTION_CHANGED_MESSAGE = 'CALIBRATE_PUSH_SUBSCRIPTION_CHANGED';
const CLEAR_USER_CACHES_MESSAGE = 'CALIBRATE_CLEAR_USER_SCOPED_CACHES';
const USER_CACHES_CLEARED_MESSAGE = 'CALIBRATE_USER_SCOPED_CACHES_CLEARED';

function isBackendPath(pathname) {
  return /^\/(?:api|auth)(?:\/|$)/.test(pathname);
}

function isVersionedStaticAsset(pathname) {
  return /^\/_expo\/static\/(?:js|css)\/.+-[0-9a-f]{8,}\.(?:js|css)$/.test(pathname)
    || /^\/assets\/.+[.-][0-9a-f]{8,}\.[a-z0-9]+$/i.test(pathname);
}

function isExplicitShellAsset(pathname) {
  return pathname !== '/index.html' && APP_SHELL.includes(pathname);
}

function isCacheableStaticAsset(url) {
  return url.origin === self.location.origin
    && (isVersionedStaticAsset(url.pathname) || isExplicitShellAsset(url.pathname));
}

function isCacheableResponse(response) {
  return response.ok && (response.type === 'basic' || response.type === 'default');
}

async function clearUserScopedCaches() {
  const keys = await caches.keys();
  await Promise.all(keys
    .filter((key) => key.startsWith(USER_CACHE_PREFIX))
    .map((key) => caches.delete(key)));
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
        .filter((key) => key.startsWith(SHELL_CACHE_PREFIX) && key !== CACHE_NAME)
        .map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    event.waitUntil(self.skipWaiting());
    return;
  }
  if (event.data?.type === CLEAR_USER_CACHES_MESSAGE) {
    event.waitUntil(clearUserScopedCaches().then(() => {
      event.source?.postMessage?.({ type: USER_CACHES_CLEARED_MESSAGE });
    }));
  }
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
      // Only build-time exported HTML is cached; never store authenticated navigation responses.
      const routePath = url.pathname === '/' ? '/index.html'
        : url.pathname.endsWith('.html') ? url.pathname : `${url.pathname.replace(/\/$/, '')}.html`;
      return (await cache.match(routePath)) ?? (await cache.match('/index.html')) ?? Response.error();
    }));
    return;
  }

  if (!isCacheableStaticAsset(url)) return;
  event.respondWith(caches.open(CACHE_NAME).then(async (cache) => {
    const cached = await cache.match(request);
    if (cached) return cached;
    const response = await fetch(request);
    if (isCacheableResponse(response)) await cache.put(request, response.clone());
    return response;
  }));
});
