export type RouteAuthentication = 'public' | 'signed-out-only' | 'authenticated';
export type DeepLinkBehavior = 'render' | 'session-redirect' | 'alias-redirect';

export type RouteExpectation = {
  path: string;
  authentication: RouteAuthentication;
  deepLink: DeepLinkBehavior;
  signedOutPath: string;
  authenticatedPath: string;
  reload: 'preserve' | 'preserve-redirect';
  historyFallback: string | null;
};

/**
 * Canonical browser paths exported from mobile/app. Route groups are omitted because
 * Expo Router does not expose them in URLs. Keep this list exhaustive when adding a route.
 */
export const ROUTE_MATRIX = [
  { path: '/', authentication: 'public', deepLink: 'session-redirect', signedOutPath: '/', authenticatedPath: '/today', reload: 'preserve-redirect', historyFallback: null },
  { path: '/login', authentication: 'signed-out-only', deepLink: 'session-redirect', signedOutPath: '/login', authenticatedPath: '/today', reload: 'preserve-redirect', historyFallback: null },
  { path: '/register', authentication: 'signed-out-only', deepLink: 'session-redirect', signedOutPath: '/register', authenticatedPath: '/today', reload: 'preserve-redirect', historyFallback: null },
  { path: '/privacy', authentication: 'public', deepLink: 'render', signedOutPath: '/privacy', authenticatedPath: '/privacy', reload: 'preserve', historyFallback: null },
  { path: '/account-deletion', authentication: 'public', deepLink: 'render', signedOutPath: '/account-deletion', authenticatedPath: '/account-deletion', reload: 'preserve', historyFallback: null },
  { path: '/health-connect-privacy', authentication: 'public', deepLink: 'render', signedOutPath: '/health-connect-privacy', authenticatedPath: '/health-connect-privacy', reload: 'preserve', historyFallback: null },
  { path: '/onboarding', authentication: 'authenticated', deepLink: 'session-redirect', signedOutPath: '/login', authenticatedPath: '/today', reload: 'preserve-redirect', historyFallback: null },
  { path: '/today', authentication: 'authenticated', deepLink: 'render', signedOutPath: '/login', authenticatedPath: '/today', reload: 'preserve', historyFallback: null },
  { path: '/progress', authentication: 'authenticated', deepLink: 'render', signedOutPath: '/login', authenticatedPath: '/progress', reload: 'preserve', historyFallback: null },
  { path: '/settings', authentication: 'authenticated', deepLink: 'render', signedOutPath: '/login', authenticatedPath: '/settings', reload: 'preserve', historyFallback: null },
  { path: '/food-log', authentication: 'authenticated', deepLink: 'render', signedOutPath: '/login', authenticatedPath: '/food-log', reload: 'preserve', historyFallback: '/today' },
  { path: '/weight-trend', authentication: 'authenticated', deepLink: 'render', signedOutPath: '/login', authenticatedPath: '/weight-trend', reload: 'preserve', historyFallback: '/progress' },
  { path: '/activity', authentication: 'authenticated', deepLink: 'render', signedOutPath: '/login', authenticatedPath: '/activity', reload: 'preserve', historyFallback: '/today' },
  { path: '/my-foods', authentication: 'authenticated', deepLink: 'render', signedOutPath: '/login', authenticatedPath: '/my-foods', reload: 'preserve', historyFallback: '/settings' },
  { path: '/notifications', authentication: 'authenticated', deepLink: 'render', signedOutPath: '/login', authenticatedPath: '/notifications', reload: 'preserve', historyFallback: '/today' },
  { path: '/about', authentication: 'authenticated', deepLink: 'render', signedOutPath: '/login', authenticatedPath: '/about', reload: 'preserve', historyFallback: '/settings' },
  { path: '/weight', authentication: 'authenticated', deepLink: 'render', signedOutPath: '/login', authenticatedPath: '/weight', reload: 'preserve', historyFallback: '/progress' },
  { path: '/barcode', authentication: 'authenticated', deepLink: 'render', signedOutPath: '/login', authenticatedPath: '/barcode', reload: 'preserve', historyFallback: null },
  { path: '/log', authentication: 'authenticated', deepLink: 'alias-redirect', signedOutPath: '/login', authenticatedPath: '/today', reload: 'preserve-redirect', historyFallback: null },
  { path: '/goals', authentication: 'authenticated', deepLink: 'alias-redirect', signedOutPath: '/login', authenticatedPath: '/progress', reload: 'preserve-redirect', historyFallback: null },
] as const satisfies readonly RouteExpectation[];

export const PUBLIC_ROUTE_HEADINGS = {
  '/login': 'Sign in',
  '/register': 'Create account',
  '/privacy': 'Privacy policy',
  '/account-deletion': 'Delete your Calibrate account',
  '/health-connect-privacy': 'How Calibrate uses health data',
} as const;
