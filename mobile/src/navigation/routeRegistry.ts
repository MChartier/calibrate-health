export const ROUTE_IDS = [
  'root',
  'login',
  'register',
  'privacy',
  'account-deletion',
  'health-connect-privacy',
  'onboarding',
  'today',
  'progress',
  'settings',
  'food-log',
  'weight-trend',
  'activity',
  'my-foods',
  'notifications',
  'about',
  'weight',
  'barcode',
] as const;

export type RouteId = (typeof ROUTE_IDS)[number];
export type RouteAuthClass = 'public' | 'signed-out-only' | 'authenticated';
export type RouteShellPolicy = 'public' | 'app' | 'overlay' | 'standalone';
export type RouteDeepLinkBehavior = 'render' | 'session-redirect';

export type RouteAlias = {
  path: `/${string}`;
  authenticatedRedirect: RouteId;
};

export type RouteDefinition = {
  path: '/' | `/${string}`;
  title: string;
  documentTitle: string;
  parent: RouteId | null;
  fallback: RouteId | null;
  backLabel: string | null;
  authClass: RouteAuthClass;
  shellPolicy: RouteShellPolicy;
  deepLink: RouteDeepLinkBehavior;
  authenticatedRedirect: RouteId | null;
  aliases: readonly RouteAlias[];
};

const route = (
  definition: Omit<RouteDefinition, 'documentTitle' | 'aliases'> & {
    documentTitle?: string;
    aliases?: readonly RouteAlias[];
  },
): RouteDefinition => ({
  ...definition,
  documentTitle: definition.documentTitle ?? `${definition.title} - Calibrate`,
  aliases: definition.aliases ?? [],
});

/**
 * Canonical route metadata shared by the Expo shell and exported-web route tests.
 * Route groups are intentionally absent because they never appear in public URLs.
 */
export const ROUTE_REGISTRY = {
  root: route({
    path: '/',
    title: 'Calibrate',
    documentTitle: 'calibrate',
    parent: null,
    fallback: null,
    backLabel: null,
    authClass: 'public',
    shellPolicy: 'public',
    deepLink: 'session-redirect',
    authenticatedRedirect: 'today',
  }),
  login: route({
    path: '/login',
    title: 'Sign in',
    parent: null,
    fallback: null,
    backLabel: null,
    authClass: 'signed-out-only',
    shellPolicy: 'public',
    deepLink: 'session-redirect',
    authenticatedRedirect: 'today',
  }),
  register: route({
    path: '/register',
    title: 'Create account',
    parent: null,
    fallback: null,
    backLabel: null,
    authClass: 'signed-out-only',
    shellPolicy: 'public',
    deepLink: 'session-redirect',
    authenticatedRedirect: 'today',
  }),
  privacy: route({
    path: '/privacy',
    title: 'Privacy policy',
    parent: null,
    fallback: null,
    backLabel: null,
    authClass: 'public',
    shellPolicy: 'public',
    deepLink: 'render',
    authenticatedRedirect: null,
  }),
  'account-deletion': route({
    path: '/account-deletion',
    title: 'Delete your Calibrate account',
    parent: null,
    fallback: null,
    backLabel: null,
    authClass: 'public',
    shellPolicy: 'public',
    deepLink: 'render',
    authenticatedRedirect: null,
  }),
  'health-connect-privacy': route({
    path: '/health-connect-privacy',
    title: 'How Calibrate uses health data',
    parent: null,
    fallback: null,
    backLabel: null,
    authClass: 'public',
    shellPolicy: 'public',
    deepLink: 'render',
    authenticatedRedirect: null,
  }),
  onboarding: route({
    path: '/onboarding',
    title: 'Set up Calibrate',
    parent: null,
    fallback: null,
    backLabel: null,
    authClass: 'authenticated',
    shellPolicy: 'standalone',
    deepLink: 'session-redirect',
    authenticatedRedirect: 'today',
  }),
  today: route({
    path: '/today',
    title: 'Today',
    parent: null,
    fallback: null,
    backLabel: null,
    authClass: 'authenticated',
    shellPolicy: 'app',
    deepLink: 'render',
    authenticatedRedirect: null,
    aliases: [{ path: '/log', authenticatedRedirect: 'today' }],
  }),
  progress: route({
    path: '/progress',
    title: 'Progress',
    parent: null,
    fallback: null,
    backLabel: null,
    authClass: 'authenticated',
    shellPolicy: 'app',
    deepLink: 'render',
    authenticatedRedirect: null,
    aliases: [{ path: '/goals', authenticatedRedirect: 'progress' }],
  }),
  settings: route({
    path: '/settings',
    title: 'Settings',
    parent: null,
    fallback: null,
    backLabel: null,
    authClass: 'authenticated',
    shellPolicy: 'app',
    deepLink: 'render',
    authenticatedRedirect: null,
  }),
  'food-log': route({
    path: '/food-log',
    title: 'Food log',
    parent: 'today',
    fallback: 'today',
    backLabel: 'Back to Today',
    authClass: 'authenticated',
    shellPolicy: 'app',
    deepLink: 'render',
    authenticatedRedirect: null,
  }),
  'weight-trend': route({
    path: '/weight-trend',
    title: 'Trend',
    parent: 'progress',
    fallback: 'progress',
    backLabel: 'Back to Progress',
    authClass: 'authenticated',
    shellPolicy: 'app',
    deepLink: 'render',
    authenticatedRedirect: null,
  }),
  activity: route({
    path: '/activity',
    title: 'Activity',
    parent: 'settings',
    fallback: 'settings',
    backLabel: 'Back to Settings',
    authClass: 'authenticated',
    shellPolicy: 'app',
    deepLink: 'render',
    authenticatedRedirect: null,
  }),
  'my-foods': route({
    path: '/my-foods',
    title: 'Saved foods',
    parent: 'settings',
    fallback: 'settings',
    backLabel: 'Back to Settings',
    authClass: 'authenticated',
    shellPolicy: 'app',
    deepLink: 'render',
    authenticatedRedirect: null,
  }),
  notifications: route({
    path: '/notifications',
    title: 'Notifications',
    parent: 'today',
    fallback: 'today',
    backLabel: 'Back to Today',
    authClass: 'authenticated',
    shellPolicy: 'app',
    deepLink: 'render',
    authenticatedRedirect: null,
  }),
  about: route({
    path: '/about',
    title: 'About Calibrate',
    parent: 'settings',
    fallback: 'settings',
    backLabel: 'Back to Settings',
    authClass: 'authenticated',
    shellPolicy: 'app',
    deepLink: 'render',
    authenticatedRedirect: null,
  }),
  weight: route({
    path: '/weight',
    title: 'Weight entry',
    parent: 'progress',
    fallback: 'progress',
    backLabel: 'Back to Progress',
    authClass: 'authenticated',
    shellPolicy: 'overlay',
    deepLink: 'render',
    authenticatedRedirect: null,
  }),
  barcode: route({
    path: '/barcode',
    title: 'Scan barcode',
    parent: 'today',
    fallback: 'today',
    backLabel: 'Back to Today',
    authClass: 'authenticated',
    shellPolicy: 'standalone',
    deepLink: 'render',
    authenticatedRedirect: null,
  }),
} as const satisfies Record<RouteId, RouteDefinition>;

export type RouteMatch = {
  routeId: RouteId;
  definition: RouteDefinition;
  matchedPath: string;
  canonicalPath: string;
  isAlias: boolean;
};

const trimRoutePath = (pathname: string): string => {
  const pathOnly = pathname.split(/[?#]/, 1)[0] ?? '/';
  if (pathOnly === '/') return pathOnly;
  return pathOnly.replace(/\/+$/, '') || '/';
};

export const REGISTERED_ROUTE_PATHS = ROUTE_IDS.flatMap((routeId) => {
  const definition = ROUTE_REGISTRY[routeId];
  return [definition.path, ...definition.aliases.map((alias) => alias.path)];
});

export function getRouteDefinition(routeId: RouteId): RouteDefinition {
  return ROUTE_REGISTRY[routeId];
}

export function canonicalPathForRoute(routeId: RouteId): RouteDefinition['path'] {
  return ROUTE_REGISTRY[routeId].path;
}

export function getRouteByPath(pathname: string): RouteMatch | null {
  const matchedPath = trimRoutePath(pathname);
  for (const routeId of ROUTE_IDS) {
    const definition = ROUTE_REGISTRY[routeId];
    if (definition.path === matchedPath) {
      return {
        routeId,
        definition,
        matchedPath,
        canonicalPath: definition.path,
        isAlias: false,
      };
    }
    if (definition.aliases.some((alias) => alias.path === matchedPath)) {
      return {
        routeId,
        definition,
        matchedPath,
        canonicalPath: definition.path,
        isAlias: true,
      };
    }
  }
  return null;
}

export function getRouteParent(routeId: RouteId): RouteDefinition | null {
  const parent = ROUTE_REGISTRY[routeId].parent;
  return parent ? ROUTE_REGISTRY[parent] : null;
}

export function getRouteFallback(routeId: RouteId): RouteDefinition | null {
  const fallback = ROUTE_REGISTRY[routeId].fallback;
  return fallback ? ROUTE_REGISTRY[fallback] : null;
}
