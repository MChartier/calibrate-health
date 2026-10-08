import { defineConfig } from '../goal-446/node_modules/@playwright/test';
export default defineConfig({ testDir: '.', testMatch: 'capture.spec.ts', workers: 1,
  timeout: 45000, use: { baseURL: 'http://127.0.0.1:18445', channel: 'chrome',
    viewport: { width: 1100, height: 900 }, locale: 'en-US', timezoneId: 'America/Los_Angeles',
    colorScheme: 'light', reducedMotion: 'reduce' }, reporter: 'list' });
