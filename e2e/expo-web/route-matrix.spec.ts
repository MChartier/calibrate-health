import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {
  DETERMINISTIC_CLOCK_STEP_MS,
  FROZEN_NOW,
  test,
  expect,
  UX_FIXTURE_STATES,
} from './fixtures';
import { PUBLIC_ROUTE_HEADINGS, ROUTE_MATRIX } from './route-matrix';

const repoRoot = process.cwd();
const appRoot = path.join(repoRoot, 'mobile', 'app');
const AUTHENTICATED_DESTINATION_HEADINGS = {
  '/today': 'Today',
  '/progress': 'Progress',
  '/settings': 'Account',
  '/food-log': 'Food log',
  '/weight-trend': 'Trend',
  '/activity': 'Activity',
  '/my-foods': 'My Foods',
  '/notifications': 'Notifications',
  '/about': 'About Calibrate',
} as const;
const AUTHENTICATED_ROUTE_GROUPS = [
  { name: 'public and primary routes', routes: ROUTE_MATRIX.slice(0, 10) },
  { name: 'secondary and alias routes', routes: ROUTE_MATRIX.slice(10) },
];

function collectRouteFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) return collectRouteFiles(absolutePath);
    return entry.isFile() ? [absolutePath] : [];
  });
}

function routePathFromFile(filePath: string): string | null {
  const relativePath = path.relative(appRoot, filePath).replaceAll('\\', '/');
  if (!relativePath.endsWith('.tsx')) return null;
  if (/(?:^|\/)\_layout(?:\.web)?\.tsx$/.test(relativePath)) return null;
  if (relativePath === '+html.tsx' || relativePath === '+not-found.tsx') return null;

  const routeSegments = relativePath
    .replace(/(?:\.web)?\.tsx$/, '')
    .split('/')
    .filter((segment) => !/^\(.+\)$/.test(segment));
  if (routeSegments.at(-1) === 'index') routeSegments.pop();
  return `/${routeSegments.join('/')}`.replace(/\/$/, '') || '/';
}

test('route matrix declares every current browser route exactly once', () => {
  const sourceRoutes = [...new Set(
    collectRouteFiles(appRoot)
      .map(routePathFromFile)
      .filter((route): route is string => route !== null),
  )].sort();
  const declaredRoutes = ROUTE_MATRIX.map(({ path: routePath }) => routePath).sort();

  expect(declaredRoutes).toEqual(sourceRoutes);
  expect(new Set(declaredRoutes).size).toBe(ROUTE_MATRIX.length);
  for (const route of ROUTE_MATRIX) {
    expect(route.authentication).toMatch(/^(public|signed-out-only|authenticated)$/);
    expect(route.deepLink).toMatch(/^(render|session-redirect|alias-redirect)$/);
    expect(route.signedOutPath).toMatch(/^\//);
    expect(route.authenticatedPath).toMatch(/^\//);
    if (route.deepLink === 'render') expect(route.authenticatedPath).toBe(route.path);
    if (route.deepLink === 'alias-redirect') expect(route.authenticatedPath).not.toBe(route.path);
    expect(route.reload === 'preserve-redirect').toBe(route.deepLink !== 'render');
  }
});

test('signed-out direct entry and reload follow the declared route matrix', async ({ page, ux }) => {
  await ux.install('signed-out');

  for (const route of ROUTE_MATRIX) {
    const directResponse = await page.goto(route.path);
    expect(directResponse?.status(), `direct entry for ${route.path}`).toBe(200);
    await expect(page, `signed-out destination for ${route.path}`).toHaveURL((url) => (
      url.pathname === route.signedOutPath
    ));

    const heading = PUBLIC_ROUTE_HEADINGS[route.signedOutPath as keyof typeof PUBLIC_ROUTE_HEADINGS];
    if (heading) {
      await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
    } else if (route.signedOutPath === '/') {
      await expect(page.getByText('Calibrate Health', { exact: true })).toBeVisible();
    } else {
      await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
    }

    const reloadResponse = await page.reload();
    expect(reloadResponse?.status(), `reload for ${route.path}`).toBe(200);
    await expect(page, `reloaded destination for ${route.path}`).toHaveURL((url) => (
      url.pathname === route.signedOutPath
    ));
  }
});

for (const routeGroup of AUTHENTICATED_ROUTE_GROUPS) {
  test(`authenticated direct entry and reload cover ${routeGroup.name}`, async ({ page, ux }) => {
    await ux.install('populated');

    for (const route of routeGroup.routes) {
      const directResponse = await page.goto(route.path);
      expect(directResponse?.status(), `authenticated direct entry for ${route.path}`).toBe(200);
      await expect(page, `authenticated destination for ${route.path}`).toHaveURL((url) => (
        url.pathname === route.authenticatedPath
      ));

      const publicHeading = PUBLIC_ROUTE_HEADINGS[
        route.authenticatedPath as keyof typeof PUBLIC_ROUTE_HEADINGS
      ];
      const shellHeading = AUTHENTICATED_DESTINATION_HEADINGS[
        route.authenticatedPath as keyof typeof AUTHENTICATED_DESTINATION_HEADINGS
      ];
      if (route.path === '/log') {
        await expect(page.getByRole('dialog').filter({ hasText: 'Add food' })).toBeVisible();
      } else if (publicHeading) {
        await expect(page.getByRole('heading', { name: publicHeading, exact: true })).toBeVisible();
      } else if (shellHeading) {
        await expect(page.getByRole('heading', { name: shellHeading, exact: true }).first()).toBeVisible();
      } else if (route.authenticatedPath === '/weight') {
        await expect(page.getByRole('dialog', { name: 'Weight entry', exact: true })).toBeVisible();
      } else if (route.authenticatedPath === '/barcode') {
        await expect(page.getByRole('heading', {
          name: /Camera permission|Scan barcode|Food logging is unavailable/,
        }).first()).toBeVisible();
      }

      const reloadResponse = await page.reload();
      expect(reloadResponse?.status(), `authenticated reload for ${route.path}`).toBe(200);
      await expect(page, `authenticated reloaded destination for ${route.path}`).toHaveURL((url) => (
        url.pathname === route.authenticatedPath
      ));
    }
  });
}

test('browser Back restores the previous auth route', async ({ page, ux }) => {
  await ux.install('signed-out');
  await page.goto('/login');
  await page.getByRole('link', { name: 'Create an account', exact: true }).click();
  await expect(page).toHaveURL((url) => url.pathname === '/register');

  await page.goBack();
  await expect(page).toHaveURL((url) => url.pathname === '/login');
  await expect(page.getByRole('button', { name: 'Sign in', exact: true })).toBeVisible();
});

test('authenticated history and registered parent fallbacks return to the declared route', async ({ page, ux }) => {
  await ux.install('populated');

  await page.goto('/today');
  await page.goto('/activity');
  await page.getByRole('button', { name: 'Go back', exact: true }).click();
  await expect(page).toHaveURL((url) => url.pathname === '/today');

  await page.goto('/weight-trend');
  await page.getByRole('button', { name: 'Back to Progress', exact: true }).click();
  await expect(page).toHaveURL((url) => url.pathname === '/progress');

  await page.goto('/food-log');
  await page.getByRole('button', { name: 'Back to Today', exact: true }).click();
  await expect(page).toHaveURL((url) => url.pathname === '/today');

  expect(ROUTE_MATRIX.find(({ path: routePath }) => routePath === '/activity')?.historyFallback).toBe('/today');
  expect(ROUTE_MATRIX.find(({ path: routePath }) => routePath === '/weight-trend')?.historyFallback).toBe('/progress');
  expect(ROUTE_MATRIX.find(({ path: routePath }) => routePath === '/food-log')?.historyFallback).toBe('/today');
});

test('barcode preserves its direct route while authentication restoration is pending', async ({ page, ux }) => {
  await ux.install('populated');
  let restoreSession = () => {};
  const sessionRestored = new Promise<void>((resolve) => {
    restoreSession = resolve;
  });
  await page.route('**/auth/me', async (route) => {
    await sessionRestored;
    await route.fallback();
  });

  await page.goto('/barcode');
  await expect(page).toHaveURL((url) => url.pathname === '/barcode');
  await expect(page.getByText('Restoring session...', { exact: true })).toBeVisible();

  restoreSession();
  await expect(page).toHaveURL((url) => url.pathname === '/barcode');
  await expect(page.getByRole('heading', {
    name: /Camera permission|Scan barcode|Food logging is unavailable/,
  }).first()).toBeVisible();
});

test('unknown extensionless paths use the static-host fallback', async ({ page, ux }) => {
  await ux.install('signed-out');
  const directResponse = await page.goto('/release-fallback-probe');
  expect(directResponse?.status()).toBe(200);
  expect(directResponse?.headers()['x-calibrate-spa-fallback']).toBe('1');
  await expect(page).toHaveURL((url) => url.pathname === '/release-fallback-probe');

  const reloadResponse = await page.reload();
  expect(reloadResponse?.status()).toBe(200);
  expect(reloadResponse?.headers()['x-calibrate-spa-fallback']).toBe('1');
});

test('deterministic fixtures freeze dates and generated IDs', async ({ page, ux }) => {
  await ux.install('populated');
  await page.goto('/today');

  const deterministicInputs = await page.evaluate(() => ({
    firstNow: Date.now(),
    secondNow: Date.now(),
    constructedNow: new Date().getTime(),
    firstId: crypto.randomUUID(),
    secondId: crypto.randomUUID(),
  }));
  const frozenEpoch = Date.parse(FROZEN_NOW);
  expect((deterministicInputs.firstNow - frozenEpoch) % DETERMINISTIC_CLOCK_STEP_MS).toBe(0);
  expect(deterministicInputs.secondNow - deterministicInputs.firstNow).toBe(DETERMINISTIC_CLOCK_STEP_MS);
  expect(deterministicInputs.constructedNow - deterministicInputs.secondNow).toBe(DETERMINISTIC_CLOCK_STEP_MS);
  expect(deterministicInputs.firstId).toBe('00000000-0000-4000-8000-000000000001');
  expect(deterministicInputs.secondId).toBe('00000000-0000-4000-8000-000000000002');
});

test('empty, paused, loading, failed, stale, and offline states are named fixture contracts', () => {
  expect(UX_FIXTURE_STATES).toEqual([
    'signed-out',
    'populated',
    'empty',
    'paused',
    'loading',
    'failed-request',
    'stale',
    'offline',
  ]);
});
