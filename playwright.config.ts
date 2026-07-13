import { defineConfig } from '@playwright/test';
import path from 'node:path';
import process from 'node:process';

const DEFAULT_BASE_URL = 'http://127.0.0.1:5173';
const DEFAULT_API_URL = 'http://127.0.0.1:3000';
const DEFAULT_E2E_DATABASE_URL =
  'postgresql://calibrate:calibrate_e2e@127.0.0.1:55432/calibrate_e2e?schema=public';
const callerOwnedBaseURL = process.env.CALIBRATE_E2E_BASE_URL?.trim();
const baseURL = callerOwnedBaseURL ?? DEFAULT_BASE_URL;
const chromeExecutablePath = process.env.PLAYWRIGHT_CHROME_PATH?.trim();
// npm runs this config from the package root; keeping one absolute anchor makes child cwd values unambiguous.
const repoRoot = process.cwd();

try {
  process.loadEnvFile(path.join(repoRoot, 'backend/.env'));
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
}

/** Reject database targets that could contain anything other than disposable local E2E data. */
function requireDisposableLocalDatabase(databaseURL: string): string {
  const parsed = new URL(databaseURL);
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  const isLoopback = parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost';
  const isNamedForE2E = /(^|[_-])e2e($|[_-])/i.test(databaseName);

  if (!isLoopback || !isNamedForE2E) {
    throw new Error(
      'CALIBRATE_E2E_DATABASE_URL must use localhost/127.0.0.1 and an E2E-named database because the browser suite resets test-user tracking data.',
    );
  }

  return databaseURL;
}

const databaseURL = requireDisposableLocalDatabase(
  process.env.CALIBRATE_E2E_DATABASE_URL?.trim() || DEFAULT_E2E_DATABASE_URL,
);

if (callerOwnedBaseURL) {
  const callerOwnedURL = new URL(callerOwnedBaseURL);
  const isLoopback = callerOwnedURL.hostname === '127.0.0.1' || callerOwnedURL.hostname === 'localhost';
  if (!isLoopback || process.env.CALIBRATE_E2E_ALLOW_DESTRUCTIVE_RESET !== 'true') {
    throw new Error(
      'CALIBRATE_E2E_BASE_URL is allowed only for a loopback server with CALIBRATE_E2E_ALLOW_DESTRUCTIVE_RESET=true.',
    );
  }
}

// Prevent unrelated backend/.env deployment settings from changing the managed test server's ports or cookies.
const backendEnv = { ...process.env };
delete backendEnv.SESSION_COOKIE_DOMAIN;
Object.assign(backendEnv, {
  AUTO_LOGIN_TEST_USER: 'true',
  CORS_ORIGINS: `${DEFAULT_BASE_URL},http://localhost:5173`,
  DATABASE_URL: databaseURL,
  FRONTEND_PORT: '5173',
  NODE_ENV: 'development',
  PORT: '3000',
  SESSION_COOKIE_NAME: 'calibrate.e2e.sid',
  SESSION_COOKIE_SAMESITE: 'lax',
  SESSION_COOKIE_SECURE: 'false',
  SESSION_SECRET: 'calibrate-local-e2e-session-secret',
  VITE_DEV_SERVER_PORT: '5173',
});

// Prefer the machine's Chrome installation so local E2E does not require a Playwright browser download.
const systemChrome = chromeExecutablePath
  ? { launchOptions: { executablePath: chromeExecutablePath } }
  : { channel: process.env.PLAYWRIGHT_CHROME_CHANNEL ?? 'chrome' };

export default defineConfig({
  testDir: './e2e/web',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 90_000,
  expect: {
    timeout: 10_000,
  },
  reporter: 'list',
  outputDir: '.codex-screenshots/playwright-results',
  use: {
    baseURL,
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
    locale: 'en-US',
    timezoneId: 'America/Los_Angeles',
    reducedMotion: 'reduce',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
    video: 'off',
    ...systemChrome,
  },
  projects: [
    {
      name: 'desktop-critical',
      testMatch: 'tracking.spec.ts',
      use: { viewport: { width: 1440, height: 1000 } },
    },
    {
      name: 'mobile-responsive',
      dependencies: ['desktop-critical'],
      testMatch: 'mobile.spec.ts',
      use: {
        viewport: { width: 390, height: 844 },
        hasTouch: true,
        isMobile: true,
      },
    },
  ],
  webServer: callerOwnedBaseURL
    ? undefined
    : [
        {
          // Avoid nodemon/npm indirection so Playwright can stop the exact backend process on every host OS.
          command: 'node node_modules/ts-node/dist/bin.js src/index.ts',
          cwd: path.join(repoRoot, 'backend'),
          env: backendEnv,
          url: `${DEFAULT_API_URL}/api/v1/readyz`,
          reuseExistingServer: false,
          timeout: 120_000,
          stdout: 'pipe',
          stderr: 'pipe',
        },
        {
          // E2E focuses on app behavior; keeping the dev service worker off prevents stale cached routes.
          command: 'node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5173 --strictPort',
          cwd: path.join(repoRoot, 'frontend'),
          env: {
            ...process.env,
            VITE_ENABLE_SW_DEV: '0',
          },
          url: DEFAULT_BASE_URL,
          reuseExistingServer: false,
          timeout: 120_000,
          stdout: 'pipe',
          stderr: 'pipe',
        },
      ],
});
